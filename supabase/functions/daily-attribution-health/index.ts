// Round 7 — daily digest cron. Emits one summary row to cron_run_log so the
// UI can render a 7-day "Attribution health" sparkline in MailboxSettings.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";
import { logCronRun } from "../_shared/cron-log.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const { count: unmatchedCount } = await supabase
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", "unmatched");

    const { count: claimedToday } = await supabase
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h)
      .neq("lead_id", "unmatched")
      .neq("lead_id", "role_based")
      .neq("lead_id", "auto_reply")
      .neq("lead_id", "firm_activity");

    const { count: noiseToday } = await supabase
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h)
      .in("lead_id", ["role_based", "auto_reply"]);

    const { count: pendingIntermediaries } = await supabase
      .from("pending_attribution_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("reason", "intermediary_candidate")
      .eq("status", "pending");

    const { count: pendingAttributions } = await supabase
      .from("pending_attribution_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: quarantinedLeads } = await supabase
      .from("lead_email_metrics")
      .select("lead_id", { count: "exact", head: true })
      .eq("email_quarantined", true);

    const details = {
      unmatched_total: unmatchedCount ?? 0,
      claimed_24h: claimedToday ?? 0,
      noise_routed_24h: noiseToday ?? 0,
      pending_intermediaries: pendingIntermediaries ?? 0,
      pending_attributions: pendingAttributions ?? 0,
      quarantined_leads: quarantinedLeads ?? 0,
    };

    await logCronRun("daily-attribution-health", "success", 1, details);

    return new Response(JSON.stringify({ ok: true, ...details }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun("daily-attribution-health", "error", 0, {}, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
