// Round 7 — admin-triggered re-processor for the historical unmatched backlog.
// Runs the full Round 6/7 pipeline against existing `lead_id='unmatched'` rows
// in chunks of 500. Logs progress to cron_run_log so the UI can poll counts.
//
// Resolution order per row:
//   1. Noise classification (role_based / auto_reply / firm_activity)
//   2. Memoized auto-classified noise senders
//   3. Internal sender → claim by thread, else by to-overlap, else role_based
//   4. Thread-continuity (thread already maps to exactly one active lead)
//   5. Forwarded-sender extraction (Fwd: emails)
//   6. CC participant overlap with any known lead's contact set
//
// Skips: is_intermediary senders, suppressed addresses, and rows already
// re-classified this run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { classifyEmail, sentinelForClass } from "../_shared/classify-email.ts";
import { isInternalSender } from "../_shared/internal-sender.ts";
import { extractOriginalSender } from "../_shared/extract-original-sender.ts";
import { logCronRun } from "../_shared/cron-log.ts";

const CHUNK = 500;
const MAX_CHUNKS_PER_RUN = 50; // process up to 25k per invocation

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let totalScanned = 0;
  let totalReclassified = 0;
  let totalThreadClaimed = 0;
  let totalForwardClaimed = 0;
  let totalCcClaimed = 0;
  let totalInternalClaimed = 0;
  let totalNoiseRouted = 0;
  let totalRemainingUnmatched = 0;

  try {
    // Build a lookup of known leads ONCE per invocation
    const { data: leads } = await supabase
      .from("leads")
      .select("id, email, secondary_contacts, is_duplicate, archived_at")
      .or("archived_at.is.null,is_duplicate.eq.false");

    const emailToLead = new Map<string, string>();
    for (const l of (leads || [])) {
      if (l.is_duplicate || l.archived_at) continue;
      const e = (l.email || "").toLowerCase().trim();
      if (e) emailToLead.set(e, l.id);
      for (const c of (Array.isArray(l.secondary_contacts) ? l.secondary_contacts : [])) {
        const se = (c?.email || "").toLowerCase().trim();
        if (se) emailToLead.set(se, l.id);
      }
    }
    // Also add stakeholders
    const { data: stakes } = await supabase
      .from("lead_stakeholders")
      .select("lead_id, email, is_intermediary");
    const intermediarySenders = new Set<string>();
    for (const s of (stakes || [])) {
      const e = (s?.email || "").toLowerCase().trim();
      if (!e) continue;
      if (s.is_intermediary) intermediarySenders.add(e);
      else if (!emailToLead.has(e)) emailToLead.set(e, s.lead_id);
    }

    // Memoized noise senders
    const { data: memoNoise } = await supabase
      .from("auto_classified_noise_senders")
      .select("sender, reason");
    const noiseMemo = new Map<string, string>();
    for (const m of (memoNoise || [])) noiseMemo.set(m.sender, m.reason || "noise:memoized");

    for (let chunkIdx = 0; chunkIdx < MAX_CHUNKS_PER_RUN; chunkIdx++) {
      const { data: rows } = await supabase
        .from("lead_emails")
        .select("id, thread_id, from_address, to_addresses, cc_addresses, subject, body_preview, body_text, raw_payload, direction")
        .eq("lead_id", "unmatched")
        .order("email_date", { ascending: false })
        .limit(CHUNK);

      if (!rows || rows.length === 0) break;
      totalScanned += rows.length;

      // Build thread-owner map for this chunk
      const threadIds = Array.from(new Set(rows.map((r: any) => r.thread_id).filter(Boolean)));
      const threadOwner = new Map<string, string>();
      const threadAmbiguous = new Set<string>();
      if (threadIds.length > 0) {
        const { data: threadRows } = await supabase
          .from("lead_emails")
          .select("thread_id, lead_id")
          .in("thread_id", threadIds)
          .neq("lead_id", "unmatched")
          .neq("lead_id", "role_based")
          .neq("lead_id", "auto_reply")
          .neq("lead_id", "firm_activity");
        for (const t of (threadRows || [])) {
          const tid = t.thread_id;
          if (!tid) continue;
          if (threadAmbiguous.has(tid)) continue;
          const existing = threadOwner.get(tid);
          if (existing && existing !== t.lead_id) {
            threadAmbiguous.add(tid);
            threadOwner.delete(tid);
          } else if (!existing) {
            threadOwner.set(tid, t.lead_id);
          }
        }
      }

      const updates: Array<{ id: string; lead_id: string; classification_reason: string }> = [];

      for (const r of rows as any[]) {
        const fromAddr = (r.from_address || "").toLowerCase().trim();
        const memoReason = noiseMemo.get(fromAddr);

        // 1+2. Noise classification (incl. memo)
        const cls = classifyEmail({
          fromAddress: fromAddr,
          subject: r.subject,
          bodyPreview: r.body_preview,
          hasListUnsubscribeHeader: false, // raw_payload header check skipped on backfill for speed
          precomputedReason: memoReason || null,
        });
        const sentinel = sentinelForClass(cls.class);
        if (sentinel) {
          updates.push({ id: r.id, lead_id: sentinel, classification_reason: cls.reason });
          totalNoiseRouted++;
          totalReclassified++;
          continue;
        }

        // 3. Internal sender path
        if (isInternalSender(fromAddr)) {
          const tid = r.thread_id;
          const owner = tid ? threadOwner.get(tid) : null;
          if (owner) {
            updates.push({ id: r.id, lead_id: owner, classification_reason: `internal_sender:${owner}` });
            totalInternalClaimed++;
            totalReclassified++;
            continue;
          }
          // Fallback — to_addresses overlap
          let claimed: string | null = null;
          for (const to of (r.to_addresses || [])) {
            const v = (to || "").toString().toLowerCase().trim();
            const lid = emailToLead.get(v);
            if (lid) { claimed = lid; break; }
          }
          if (claimed) {
            updates.push({ id: r.id, lead_id: claimed, classification_reason: `internal_sender_to:${claimed}` });
            totalInternalClaimed++;
            totalReclassified++;
            continue;
          }
          // Internal but unmatchable — park as role_based
          updates.push({ id: r.id, lead_id: "role_based", classification_reason: "internal_sender:unattributable" });
          totalNoiseRouted++;
          totalReclassified++;
          continue;
        }

        // 4. Thread continuity (skip intermediary senders)
        if (r.thread_id && !intermediarySenders.has(fromAddr)) {
          const owner = threadOwner.get(r.thread_id);
          if (owner) {
            updates.push({ id: r.id, lead_id: owner, classification_reason: `thread_continuity:${owner}` });
            totalThreadClaimed++;
            totalReclassified++;
            continue;
          }
        }

        // 5. Forwarded-sender extraction
        const subjLow = (r.subject || "").toLowerCase().trim();
        if (/^\s*(fwd?|fw):/i.test(subjLow)) {
          const orig = extractOriginalSender(r.body_text || "");
          if (orig) {
            const lid = emailToLead.get(orig.toLowerCase().trim());
            if (lid) {
              updates.push({ id: r.id, lead_id: lid, classification_reason: `forwarded_sender:${lid}` });
              totalForwardClaimed++;
              totalReclassified++;
              continue;
            }
          }
        }

        // 6. CC participant overlap (and to-overlap from external senders)
        let claimedByOverlap: string | null = null;
        let overlapTier = "";
        for (const to of (r.to_addresses || [])) {
          const v = (to || "").toString().toLowerCase().trim();
          const lid = emailToLead.get(v);
          if (lid) { claimedByOverlap = lid; overlapTier = "to"; break; }
        }
        if (!claimedByOverlap) {
          for (const cc of (r.cc_addresses || [])) {
            const v = (cc || "").toString().toLowerCase().trim();
            const lid = emailToLead.get(v);
            if (lid) { claimedByOverlap = lid; overlapTier = "cc"; break; }
          }
        }
        if (claimedByOverlap) {
          updates.push({
            id: r.id,
            lead_id: claimedByOverlap,
            classification_reason: `${overlapTier}_overlap:${claimedByOverlap}`,
          });
          totalCcClaimed++;
          totalReclassified++;
          continue;
        }

        // 7. Truly unresolvable for this run
        totalRemainingUnmatched++;
      }

      // Apply updates one row at a time (small chunk; safer than bulk upsert
      // because we need different lead_id per row).
      for (const u of updates) {
        await supabase
          .from("lead_emails")
          .update({ lead_id: u.lead_id, classification_reason: u.classification_reason })
          .eq("id", u.id);
      }
    }

    await logCronRun(
      "reclaim-unmatched-backlog",
      "success",
      totalReclassified,
      {
        scanned: totalScanned,
        thread_claimed: totalThreadClaimed,
        forward_claimed: totalForwardClaimed,
        cc_claimed: totalCcClaimed,
        internal_claimed: totalInternalClaimed,
        noise_routed: totalNoiseRouted,
        remaining_unmatched_in_run: totalRemainingUnmatched,
      },
    );

    return new Response(JSON.stringify({
      ok: true,
      scanned: totalScanned,
      reclassified: totalReclassified,
      thread_claimed: totalThreadClaimed,
      forward_claimed: totalForwardClaimed,
      cc_claimed: totalCcClaimed,
      internal_claimed: totalInternalClaimed,
      noise_routed: totalNoiseRouted,
      remaining_unmatched_in_run: totalRemainingUnmatched,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await logCronRun("reclaim-unmatched-backlog", "error", totalReclassified, {}, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
