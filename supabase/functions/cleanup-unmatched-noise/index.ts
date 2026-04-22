// Daily janitor for the unmatched email bucket and metric ghosts.
// - Deletes unmatched emails older than 60 days from any noise-listed domain
// - Deletes orphan lead_email_metrics rows whose lead_id no longer exists
// Logs a single cron_run_log row so the Automation Health panel can see it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STALE_DAYS = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  let deletedNoise = 0;
  let deletedGhostMetrics = 0;
  const errors: string[] = [];

  try {
    // 1. Pull current noise domains
    const { data: noise } = await supabase
      .from("email_noise_domains")
      .select("domain");
    const domains = (noise || []).map((r: any) => String(r.domain).toLowerCase().trim()).filter(Boolean);

    // 2. For each noise domain, hard-delete unmatched emails older than 60d
    for (const d of domains) {
      const { data: rows, error: selErr } = await supabase
        .from("lead_emails")
        .select("id")
        .eq("lead_id", "unmatched")
        .ilike("from_address", `%@${d}`)
        .lt("email_date", cutoff)
        .limit(2000);
      if (selErr) { errors.push(`select_${d}: ${selErr.message}`); continue; }
      const ids = (rows || []).map((r: any) => r.id);
      if (ids.length === 0) continue;
      const { error: delErr } = await supabase.from("lead_emails").delete().in("id", ids);
      if (delErr) { errors.push(`delete_${d}: ${delErr.message}`); continue; }
      deletedNoise += ids.length;
    }

    // 3. Orphan lead_email_metrics: lead_id not in leads
    const { data: orphans, error: orphErr } = await supabase.rpc("list_cron_jobs"); // probe call to ensure RPC works
    void orphans; void orphErr;

    const { data: allMetrics } = await supabase
      .from("lead_email_metrics")
      .select("lead_id");
    const { data: allLeads } = await supabase
      .from("leads")
      .select("id");
    const leadSet = new Set((allLeads || []).map((l: any) => l.id));
    const orphanIds = (allMetrics || [])
      .map((m: any) => m.lead_id)
      .filter((id: string) => id && !leadSet.has(id));
    if (orphanIds.length > 0) {
      const { error: delMetricErr } = await supabase
        .from("lead_email_metrics")
        .delete()
        .in("lead_id", orphanIds);
      if (delMetricErr) errors.push(`delete_metrics: ${delMetricErr.message}`);
      else deletedGhostMetrics = orphanIds.length;
    }

    const status = errors.length > 0 ? "error" : (deletedNoise + deletedGhostMetrics > 0 ? "success" : "noop");
    await logCronRun(
      "cleanup-unmatched-noise",
      status,
      deletedNoise + deletedGhostMetrics,
      { deletedNoise, deletedGhostMetrics, domainsScanned: domains.length, cutoff },
      errors.join("; "),
    );

    return new Response(
      JSON.stringify({ ok: true, deletedNoise, deletedGhostMetrics, domainsScanned: domains.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    await logCronRun("cleanup-unmatched-noise", "error", 0, {}, (e as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
