// Returns the current pg_cron registration for every automation job.
// Used by the Automation Health "Verify schedules" button to prove that
// the cron expressions the UI claims are actually wired into the database.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // pg_cron lives in the `cron` schema which RLS-blocks anon. Service role
  // can read it directly via PostgREST RPC isn't exposed, so we use a raw
  // SQL fetch via PostgREST's `rpc` only if a function exists. Easiest path:
  // hit the underlying REST endpoint with service_role.
  // Fallback: execute via a one-off SQL through pg-meta isn't available either,
  // so we read pg_cron through a Postgres function created on the fly is too
  // invasive. Instead we return the static known-set from cron_run_log heuristics.
  //
  // Strategy used here: query cron.job via `postgres` REST. In Supabase Edge,
  // service role can call `from('cron.job')` because schemas other than public
  // need to be exposed. The cleanest portable way is a tiny RPC, but to avoid
  // a migration we list jobs we expect and check their last-seen heartbeat.
  //
  // To actually read cron.job we use the SQL editor endpoint via service-role
  // PostgREST 'pg_meta' isn't enabled, so we approximate: ask pg_cron via the
  // `pg.cron_job` view if exposed; else return heartbeat-based status.

  try {
    // Try direct cron.job read (works if `cron` schema exposed to PostgREST)
    const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/list_cron_jobs`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: "{}",
    });

    if (r.ok) {
      const jobs = await r.json();
      return new Response(JSON.stringify({ ok: true, source: "rpc", jobs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: derive health from cron_run_log heartbeats over last 24h.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows } = await supabase
      .from("cron_run_log")
      .select("job_name, ran_at, status")
      .gte("ran_at", since)
      .order("ran_at", { ascending: false });

    const seen = new Map<string, { last: string; status: string; runs: number }>();
    (rows ?? []).forEach((row: any) => {
      const cur = seen.get(row.job_name);
      if (!cur) {
        seen.set(row.job_name, { last: row.ran_at, status: row.status, runs: 1 });
      } else {
        cur.runs += 1;
      }
    });

    const jobs = Array.from(seen.entries()).map(([name, v]) => ({
      jobname: name,
      schedule: "(inferred from heartbeat)",
      active: true,
      last_run: v.last,
      last_status: v.status,
      runs_24h: v.runs,
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        source: "heartbeat-fallback",
        note: "Direct cron.job read unavailable. Showing 24h heartbeat history instead.",
        jobs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
