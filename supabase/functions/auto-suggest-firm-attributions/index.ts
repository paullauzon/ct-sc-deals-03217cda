// Daily cron: scans unmatched emails from senders at known firm domains and
// proposes a likely lead based on thread continuity.
//
// Heuristic: for each (sender_email) with N unmatched messages where the sender's
// domain matches at least one active lead, find which active lead at that firm has
// the most prior thread overlap with the sender. If we find a clear winner, write
// a pending_attribution_suggestions row for human review.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PERSONAL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "msn.com", "live.com", "me.com", "mac.com", "protonmail.com",
  "proton.me", "googlemail.com", "ymail.com", "mail.com",
]);

const INTERNAL_DOMAINS = new Set(["captarget.com", "sourcecodeals.com"]);

function domainOf(email: string): string {
  return (email || "").split("@")[1]?.toLowerCase().trim() || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Build domain → active leads index
    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, email")
      .is("archived_at", null)
      .eq("is_duplicate", false);

    const leadsByDomain = new Map<string, Array<{ id: string; email: string }>>();
    for (const l of (leads || []) as any[]) {
      const d = domainOf(l.email || "");
      if (!d || PERSONAL_PROVIDERS.has(d) || INTERNAL_DOMAINS.has(d)) continue;
      const arr = leadsByDomain.get(d) || [];
      arr.push({ id: l.id, email: (l.email || "").toLowerCase() });
      leadsByDomain.set(d, arr);
    }

    // 2. Group unmatched emails by sender (domain in known firms)
    const { data: unmatched } = await supabase
      .from("lead_emails")
      .select("id, from_address, thread_id")
      .eq("lead_id", "unmatched")
      .order("email_date", { ascending: false })
      .limit(5000);

    interface SenderBucket {
      sender: string;
      domain: string;
      email_ids: string[];
      thread_ids: Set<string>;
    }
    const bySender = new Map<string, SenderBucket>();
    for (const e of (unmatched || []) as Array<{ id: string; from_address: string; thread_id: string | null }>) {
      const sender = (e.from_address || "").toLowerCase();
      if (!sender) continue;
      const d = domainOf(sender);
      if (!d || !leadsByDomain.has(d)) continue;
      let b = bySender.get(sender);
      if (!b) {
        b = { sender, domain: d, email_ids: [], thread_ids: new Set() };
        bySender.set(sender, b);
      }
      b.email_ids.push(e.id);
      if (e.thread_id) b.thread_ids.add(e.thread_id);
    }

    // 3. For each sender, score candidate leads by prior thread continuity
    let createdCount = 0;
    let skippedCount = 0;

    for (const [sender, bucket] of bySender) {
      const candidates = leadsByDomain.get(bucket.domain) || [];
      if (candidates.length === 0) continue;

      // Look up which leads have prior thread overlap with these unmatched threads
      const threadList = Array.from(bucket.thread_ids).slice(0, 50);
      let bestLeadId: string | null = null;
      let bestScore = 0;
      let reason = "";

      if (threadList.length > 0 && candidates.length > 0) {
        const candidateIds = candidates.map((c) => c.id);
        const { data: priorOnThreads } = await supabase
          .from("lead_emails")
          .select("lead_id, thread_id")
          .in("thread_id", threadList)
          .in("lead_id", candidateIds)
          .limit(500);

        const counts = new Map<string, number>();
        for (const r of (priorOnThreads || []) as Array<{ lead_id: string; thread_id: string }>) {
          counts.set(r.lead_id, (counts.get(r.lead_id) || 0) + 1);
        }
        for (const [lid, c] of counts) {
          if (c > bestScore) { bestScore = c; bestLeadId = lid; }
        }
        if (bestLeadId && bestScore >= 1) {
          reason = `Sender's threads overlap with ${bestScore} prior message${bestScore === 1 ? "" : "s"} on this lead.`;
        }
      }

      // Fallback: if only one lead at firm, suggest it (low confidence)
      if (!bestLeadId && candidates.length === 1) {
        bestLeadId = candidates[0].id;
        reason = `Only one active lead at @${bucket.domain} — likely safe to attribute.`;
      }

      if (!bestLeadId) {
        skippedCount += 1;
        continue;
      }

      // Upsert pending suggestion
      const { error: upErr } = await supabase
        .from("pending_attribution_suggestions")
        .upsert({
          sender_email: sender,
          sender_domain: bucket.domain,
          suggested_lead_id: bestLeadId,
          reason,
          email_count: bucket.email_ids.length,
          sample_email_id: bucket.email_ids[0] || null,
          status: "pending",
        }, { onConflict: "sender_email,suggested_lead_id,status", ignoreDuplicates: false });

      if (!upErr) createdCount += 1;
    }

    // 4. Log to cron_run_log
    await supabase.from("cron_run_log").insert({
      job_name: "auto-suggest-firm-attributions",
      status: "success",
      items_processed: createdCount,
      details: { senders_scanned: bySender.size, skipped: skippedCount },
    });

    return new Response(JSON.stringify({
      ok: true,
      senders_scanned: bySender.size,
      suggestions_created: createdCount,
      skipped: skippedCount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-suggest-firm-attributions error:", e);
    await supabase.from("cron_run_log").insert({
      job_name: "auto-suggest-firm-attributions",
      status: "error",
      error_message: (e as Error).message,
    });
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
