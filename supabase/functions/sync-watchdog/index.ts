// Sync watchdog — fires hourly via pg_cron.
// For each active mailbox connection:
//   1. Determines the most recent successful sync (email_sync_runs OR
//      user_email_connections.last_synced_at, whichever is newer).
//   2. Flags the connection if it hasn't synced successfully in >30 minutes.
//   3. Writes a row to cron_run_log so the AutomationHealthPanel surfaces
//      the result without needing a separate query.
//
// Intentionally read-only — never mutates connections or attempts to fix
// anything. Surfacing problems is enough; remediation is a human decision.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_THRESHOLD_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: conns } = await supabase
      .from("user_email_connections")
      .select("id, email_address, provider, last_synced_at, is_active")
      .eq("is_active", true);

    const now = Date.now();
    const checks: Array<{
      connection_id: string;
      email_address: string;
      provider: string;
      last_synced_at: string | null;
      minutes_since_sync: number | null;
      stale: boolean;
    }> = [];

    for (const c of (conns || []) as Array<{
      id: string; email_address: string; provider: string; last_synced_at: string | null;
    }>) {
      // Use the connection's last_synced_at as the source of truth — the sync
      // function stamps it at the end of every successful run, regardless of
      // whether email_sync_runs got a row (idle-incremental ticks are skipped).
      const ts = c.last_synced_at ? new Date(c.last_synced_at).getTime() : null;
      const minutes = ts ? Math.round((now - ts) / 60000) : null;
      const stale = minutes === null || minutes > STALE_THRESHOLD_MIN;
      checks.push({
        connection_id: c.id,
        email_address: c.email_address,
        provider: c.provider,
        last_synced_at: c.last_synced_at,
        minutes_since_sync: minutes,
        stale,
      });
    }

    const stale = checks.filter((c) => c.stale);
    const status = stale.length === 0 ? "success" : "error";
    const errMsg = stale.length === 0
      ? ""
      : `${stale.length} stale: ${stale.map((s) => `${s.email_address}(${s.minutes_since_sync ?? "never"}m)`).join(", ")}`;

    await logCronRun(
      "sync-watchdog",
      status,
      checks.length,
      { checks, stale_count: stale.length, threshold_min: STALE_THRESHOLD_MIN },
      errMsg,
    );

    return new Response(
      JSON.stringify({ ok: true, total: checks.length, stale: stale.length, checks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    await logCronRun("sync-watchdog", "error", 0, {}, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
