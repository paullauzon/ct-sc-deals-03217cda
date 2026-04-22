// Round 9 — Daily cron that auto-promotes high-volume unmatched senders to
// the persistent noise list.
//
// Trigger: any sender with 30+ messages in `lead_emails.lead_id='unmatched'`
// over the past 7 days. Insert into `auto_classified_noise_senders` with
// reason `auto:high_volume`, then reclassify ALL of that sender's unmatched
// rows to `role_based`.
//
// UI gets an "Undo (re-treat as unknown)" affordance via the existing
// HighVolumeSendersPanel — this cron simply prevents the backlog from
// growing unattended overnight.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { logCronRun } from "../_shared/cron-log.ts";

const HIGH_VOLUME_THRESHOLD = 30;
const WINDOW_DAYS = 7;
const MAX_PROMOTIONS_PER_RUN = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let promoted = 0;
  let reclassified = 0;
  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

    // Pull recent unmatched senders. We can't run group-by directly via REST
    // without RPC, so we fetch and aggregate in memory (capped at 5000 rows).
    const { data: rows } = await supabase
      .from("lead_emails")
      .select("from_address")
      .eq("lead_id", "unmatched")
      .gte("email_date", since)
      .limit(5000);

    const counts = new Map<string, number>();
    for (const r of (rows || [])) {
      const e = (r.from_address || "").toLowerCase().trim();
      if (!e || !e.includes("@")) continue;
      counts.set(e, (counts.get(e) || 0) + 1);
    }

    // Filter to candidates above threshold
    const candidates = Array.from(counts.entries())
      .filter(([, c]) => c >= HIGH_VOLUME_THRESHOLD)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_PROMOTIONS_PER_RUN);

    if (candidates.length === 0) {
      await logCronRun("auto-promote-noise-senders", "noop", 0, { window_days: WINDOW_DAYS });
      return new Response(JSON.stringify({ ok: true, promoted: 0, reclassified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip senders already memoized
    const senders = candidates.map(([s]) => s);
    const { data: existing } = await supabase
      .from("auto_classified_noise_senders")
      .select("sender")
      .in("sender", senders);
    const alreadyMemo = new Set<string>((existing || []).map((r: any) => r.sender));

    for (const [sender, count] of candidates) {
      if (alreadyMemo.has(sender)) continue;
      // Insert memo row
      await supabase.from("auto_classified_noise_senders").insert({
        sender,
        reason: "auto:high_volume",
        classified_as: "role_based",
        message_count: count,
      });
      promoted++;
      // Reclassify their unmatched backlog
      const { count: updated } = await supabase
        .from("lead_emails")
        .update({
          lead_id: "role_based",
          classification_reason: `noise:auto_high_volume:${count}_in_${WINDOW_DAYS}d`,
        }, { count: "exact" })
        .eq("lead_id", "unmatched")
        .eq("from_address", sender);
      reclassified += updated || 0;
    }

    await logCronRun("auto-promote-noise-senders", "success", reclassified, {
      promoted,
      window_days: WINDOW_DAYS,
      threshold: HIGH_VOLUME_THRESHOLD,
    });

    return new Response(JSON.stringify({ ok: true, promoted, reclassified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun("auto-promote-noise-senders", "error", reclassified, { promoted }, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
