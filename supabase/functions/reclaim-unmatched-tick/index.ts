// Round 9 — chunked tick worker for the unmatched backlog reclaim.
//
// Picks the oldest `running` reclaim_jobs row (if any) and processes one
// 500-row chunk against `lead_emails` where lead_id='unmatched'. Persists
// cursor + counters back onto the job row so the UI can poll progress.
//
// Resolution order per row (mirror of reclaim-unmatched-backlog):
//   1. Memoized auto-classified noise senders
//   2. Noise classifier (role_based / auto_reply / firm_activity)
//   3. Outbound branch — if direction='outbound', match via to_addresses
//   4. Internal sender path
//   5. Thread continuity
//   6. Forwarded-sender extraction
//   7. CC/to participant overlap
//   8. Firm-unrelated (new sentinel)
//   9. Otherwise — stays in unmatched, classification_reason='unresolved'
//
// Idempotent: the cron runs every 2 minutes; if no `running` job, it returns
// noop immediately.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { classifyEmail, sentinelForClass } from "../_shared/classify-email.ts";
import { isInternalSender } from "../_shared/internal-sender.ts";
import { extractOriginalSender } from "../_shared/extract-original-sender.ts";
import { detectFirmUnrelated } from "../_shared/firm-unrelated.ts";
import { logCronRun } from "../_shared/cron-log.ts";

const CHUNK = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find the oldest running job
  const { data: jobs } = await supabase
    .from("reclaim_jobs")
    .select("*")
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(1);

  const job = jobs?.[0];
  if (!job) {
    return new Response(JSON.stringify({ ok: true, noop: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let chunkScanned = 0;
  let chunkReclassified = 0;

  try {
    // Build the lookup set of known leads + contacts + firm domain map
    const { data: leads } = await supabase
      .from("leads")
      .select("id, email, secondary_contacts, is_duplicate, archived_at");

    const emailToLead = new Map<string, string>();
    const firmDomainToLead = new Map<string, string>();
    for (const l of (leads || [])) {
      if (l.is_duplicate || l.archived_at) continue;
      const e = (l.email || "").toLowerCase().trim();
      if (e) {
        emailToLead.set(e, l.id);
        if (e.includes("@")) {
          const domain = e.split("@")[1];
          if (domain && !firmDomainToLead.has(domain)) firmDomainToLead.set(domain, l.id);
        }
      }
      for (const c of (Array.isArray(l.secondary_contacts) ? l.secondary_contacts : [])) {
        const se = (c?.email || "").toLowerCase().trim();
        if (se) emailToLead.set(se, l.id);
      }
    }
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

    const { data: memoNoise } = await supabase
      .from("auto_classified_noise_senders")
      .select("sender, reason");
    const noiseMemo = new Map<string, string>();
    for (const m of (memoNoise || [])) noiseMemo.set(m.sender, m.reason || "noise:memoized");

    const { data: noiseDomainsRows } = await supabase
      .from("email_noise_domains")
      .select("domain");
    const noiseDomains = new Set<string>();
    for (const r of (noiseDomainsRows || [])) {
      const d = (r.domain || "").toLowerCase().trim();
      if (d) noiseDomains.add(d);
    }

    // Cursor-based pagination — pick the next chunk older than `cursor`
    let query = supabase
      .from("lead_emails")
      .select("id, thread_id, from_address, to_addresses, cc_addresses, subject, body_preview, body_text, direction, email_date")
      .eq("lead_id", "unmatched")
      .order("email_date", { ascending: false })
      .limit(CHUNK);
    if (job.cursor) query = query.lt("email_date", job.cursor);

    const { data: rows } = await query;

    if (!rows || rows.length === 0) {
      // Done
      await supabase.from("reclaim_jobs").update({
        status: "completed",
        finished_at: new Date().toISOString(),
        last_tick_at: new Date().toISOString(),
      }).eq("id", job.id);
      await logCronRun("reclaim-unmatched-tick", "success", 0, { job_id: job.id, completed: true });
      return new Response(JSON.stringify({ ok: true, completed: true, job_id: job.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    chunkScanned = rows.length;

    // Build thread-owner map for this chunk
    const threadIds = Array.from(new Set(rows.map((r: any) => r.thread_id).filter(Boolean)));
    const threadOwner = new Map<string, string>();
    if (threadIds.length > 0) {
      const { data: threadRows } = await supabase
        .from("lead_emails")
        .select("thread_id, lead_id")
        .in("thread_id", threadIds)
        .neq("lead_id", "unmatched")
        .neq("lead_id", "role_based")
        .neq("lead_id", "auto_reply")
        .neq("lead_id", "firm_activity")
        .neq("lead_id", "firm_unrelated");
      const threadAmbiguous = new Set<string>();
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

    let threadClaimed = 0, forwardClaimed = 0, ccClaimed = 0;
    let internalClaimed = 0, outboundClaimed = 0, noiseRouted = 0, firmUnrelatedRouted = 0;

    for (const r of rows as any[]) {
      const fromAddr = (r.from_address || "").toLowerCase().trim();
      const fromDomain = fromAddr.includes("@") ? fromAddr.split("@")[1] : "";

      // 1. Noise domain check (cheapest)
      if (fromDomain && noiseDomains.has(fromDomain)) {
        await supabase.from("lead_emails").update({
          lead_id: "role_based",
          classification_reason: `noise:domain_list:${fromDomain}`,
        }).eq("id", r.id);
        noiseRouted++; chunkReclassified++; continue;
      }

      // 2. Memo + noise classifier
      const memoReason = noiseMemo.get(fromAddr);
      const cls = classifyEmail({
        fromAddress: fromAddr,
        subject: r.subject,
        bodyPreview: r.body_preview,
        hasListUnsubscribeHeader: false,
        precomputedReason: memoReason || null,
      });
      const sentinel = sentinelForClass(cls.class);
      if (sentinel) {
        await supabase.from("lead_emails").update({
          lead_id: sentinel,
          classification_reason: cls.reason,
        }).eq("id", r.id);
        noiseRouted++; chunkReclassified++; continue;
      }

      // 3. Outbound branch — match via to_addresses
      if (r.direction === "outbound") {
        let claimed: string | null = null;
        for (const to of (r.to_addresses || [])) {
          const v = (to || "").toString().toLowerCase().trim();
          const lid = emailToLead.get(v);
          if (lid) { claimed = lid; break; }
        }
        if (claimed) {
          await supabase.from("lead_emails").update({
            lead_id: claimed,
            classification_reason: `outbound_recipient:${claimed}`,
          }).eq("id", r.id);
          outboundClaimed++; chunkReclassified++; continue;
        }
        // Outbound to internal recipient — rep-to-rep
        let allInternal = (r.to_addresses || []).length > 0;
        for (const to of (r.to_addresses || [])) {
          if (!isInternalSender(to)) { allInternal = false; break; }
        }
        if (allInternal) {
          await supabase.from("lead_emails").update({
            lead_id: "role_based",
            classification_reason: "outbound:rep_to_rep",
          }).eq("id", r.id);
          noiseRouted++; chunkReclassified++; continue;
        }
        // Outbound to truly unknown — leave but log reason
        await supabase.from("lead_emails").update({
          classification_reason: "outbound:unresolved_recipient",
        }).eq("id", r.id);
        continue;
      }

      // 4. Internal sender path
      if (isInternalSender(fromAddr)) {
        const tid = r.thread_id;
        const owner = tid ? threadOwner.get(tid) : null;
        if (owner) {
          await supabase.from("lead_emails").update({
            lead_id: owner,
            classification_reason: `internal_sender:${owner}`,
          }).eq("id", r.id);
          internalClaimed++; chunkReclassified++; continue;
        }
        let claimed: string | null = null;
        for (const to of (r.to_addresses || [])) {
          const v = (to || "").toString().toLowerCase().trim();
          const lid = emailToLead.get(v);
          if (lid) { claimed = lid; break; }
        }
        if (claimed) {
          await supabase.from("lead_emails").update({
            lead_id: claimed,
            classification_reason: `internal_sender_to:${claimed}`,
          }).eq("id", r.id);
          internalClaimed++; chunkReclassified++; continue;
        }
        await supabase.from("lead_emails").update({
          lead_id: "role_based",
          classification_reason: "internal_sender:unattributable",
        }).eq("id", r.id);
        noiseRouted++; chunkReclassified++; continue;
      }

      // 5. Thread continuity
      if (r.thread_id && !intermediarySenders.has(fromAddr)) {
        const owner = threadOwner.get(r.thread_id);
        if (owner) {
          await supabase.from("lead_emails").update({
            lead_id: owner,
            classification_reason: `thread_continuity:${owner}`,
          }).eq("id", r.id);
          threadClaimed++; chunkReclassified++; continue;
        }
      }

      // 6. Forwarded-sender extraction
      const orig = extractOriginalSender(r.subject, r.body_text);
      if (orig?.email) {
        const lid = emailToLead.get(orig.email);
        if (lid) {
          await supabase.from("lead_emails").update({
            lead_id: lid,
            classification_reason: `forwarded_sender:${lid}`,
          }).eq("id", r.id);
          forwardClaimed++; chunkReclassified++; continue;
        }
      }

      // 7. To/CC overlap
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
        await supabase.from("lead_emails").update({
          lead_id: claimedByOverlap,
          classification_reason: `${overlapTier}_overlap:${claimedByOverlap}`,
        }).eq("id", r.id);
        ccClaimed++; chunkReclassified++; continue;
      }

      // 8. Firm-unrelated detector — same firm, different person
      const knownContacts = new Set<string>(emailToLead.keys());
      const fu = detectFirmUnrelated(fromAddr, knownContacts, firmDomainToLead);
      if (fu.matched) {
        await supabase.from("lead_emails").update({
          lead_id: "firm_unrelated",
          classification_reason: `firm_unrelated:${fu.firm_domain}:${fu.firm_lead_id}`,
        }).eq("id", r.id);
        firmUnrelatedRouted++; chunkReclassified++; continue;
      }

      // 9. Truly unresolvable — write reason so we know we tried
      await supabase.from("lead_emails").update({
        classification_reason: "unresolved:no_match",
      }).eq("id", r.id);
    }

    // Persist progress + advance cursor to oldest email_date in this chunk
    const lastEmailDate = (rows as any[])[rows.length - 1].email_date;
    await supabase.from("reclaim_jobs").update({
      cursor: lastEmailDate,
      total_scanned: (job.total_scanned || 0) + chunkScanned,
      total_reclassified: (job.total_reclassified || 0) + chunkReclassified,
      thread_claimed: (job.thread_claimed || 0) + threadClaimed,
      forward_claimed: (job.forward_claimed || 0) + forwardClaimed,
      cc_claimed: (job.cc_claimed || 0) + ccClaimed,
      internal_claimed: (job.internal_claimed || 0) + internalClaimed,
      outbound_claimed: (job.outbound_claimed || 0) + outboundClaimed,
      noise_routed: (job.noise_routed || 0) + noiseRouted,
      firm_unrelated_routed: (job.firm_unrelated_routed || 0) + firmUnrelatedRouted,
      last_tick_at: new Date().toISOString(),
    }).eq("id", job.id);

    await logCronRun("reclaim-unmatched-tick", "success", chunkReclassified, {
      job_id: job.id,
      chunk_scanned: chunkScanned,
      chunk_reclassified: chunkReclassified,
    });

    return new Response(JSON.stringify({
      ok: true,
      job_id: job.id,
      chunk_scanned: chunkScanned,
      chunk_reclassified: chunkReclassified,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await supabase.from("reclaim_jobs").update({
      last_error: (e?.message || String(e)).slice(0, 500),
      last_tick_at: new Date().toISOString(),
    }).eq("id", job.id);
    await logCronRun("reclaim-unmatched-tick", "error", chunkReclassified, { job_id: job.id }, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
