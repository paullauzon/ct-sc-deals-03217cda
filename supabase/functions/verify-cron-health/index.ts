// Returns the current pg_cron registration AND recent execution history for
// every automation job. Used by the Automation Health "Verify schedules"
// button to prove that the cron expressions the UI claims are actually wired
// into the database AND actively firing — not just registered-but-silent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // Registration list (jobname, schedule, active)
    const regRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_cron_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: "{}",
    });

    let registered: any[] = [];
    if (regRes.ok) registered = await regRes.json();

    // Recent execution history (last 3 ticks per job)
    const histRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_cron_run_details`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ _limit_per_job: 3 }),
    });

    let history: any[] = [];
    if (histRes.ok) history = await histRes.json();

    // Group history by jobname
    const histByJob = new Map<string, any[]>();
    for (const h of history) {
      if (!histByJob.has(h.jobname)) histByJob.set(h.jobname, []);
      histByJob.get(h.jobname)!.push(h);
    }

    // Pull body-level heartbeats from cron_run_log for the last 24h
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: bodyRows } = await supabase
      .from("cron_run_log")
      .select("job_name, ran_at, status")
      .gte("ran_at", since)
      .order("ran_at", { ascending: false });

    const heartbeatByJob = new Map<string, { last: string; status: string; runs: number }>();
    (bodyRows ?? []).forEach((row: any) => {
      const cur = heartbeatByJob.get(row.job_name);
      if (!cur) {
        heartbeatByJob.set(row.job_name, { last: row.ran_at, status: row.status, runs: 1 });
      } else {
        cur.runs += 1;
      }
    });

    // Merge: every registered job + its last-3 pg_cron ticks + body heartbeat
    const jobs = registered.map((j: any) => {
      const recent = histByJob.get(j.jobname) ?? [];
      const hb = heartbeatByJob.get(j.jobname);
      const ticksOk = recent.filter((r: any) => r.status === "succeeded").length;
      // "registered but silent" = pg_cron ran successfully but body never logged
      const silent = recent.length > 0 && ticksOk > 0 && (!hb || hb.runs === 0);
      return {
        jobname: j.jobname,
        schedule: j.schedule,
        active: j.active,
        recent_ticks: recent.map((r: any) => ({
          status: r.status,
          start_time: r.start_time,
          return_message: r.return_message,
        })),
        body_heartbeat: hb ?? null,
        silent_warning: silent,
      };
    });

    return new Response(
      JSON.stringify({ ok: true, source: "rpc+history", jobs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
