// Backfill orchestrator entrypoint.
// UI invokes this when the user clicks "Backfill". Creates an
// email_backfill_jobs row, kicks off the discovery worker (fire-and-forget),
// and returns the job_id. The actual work runs across many invocations of
// backfill-discover + backfill-hydrate so it survives browser close, deploys,
// and edge-function wall-time limits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Window = "90d" | "1y" | "3y" | "all";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const connectionId = body.connection_id as string | undefined;
    const target: Window = (body.target_window as Window) || "90d";
    if (!connectionId) {
      return new Response(JSON.stringify({ ok: false, error: "connection_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["90d", "1y", "3y", "all"].includes(target)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid target_window" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn, error: connErr } = await supabase
      .from("user_email_connections")
      .select("id, email_address, provider, is_active")
      .eq("id", connectionId)
      .single();

    if (connErr || !conn) {
      return new Response(JSON.stringify({ ok: false, error: "connection not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!conn.is_active) {
      return new Response(JSON.stringify({ ok: false, error: "connection is inactive" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refuse to start a second job for the same connection while one is running.
    const { data: existing } = await supabase
      .from("email_backfill_jobs")
      .select("id, status")
      .eq("connection_id", connectionId)
      .in("status", ["queued", "discovering", "running", "paused"])
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: "A backfill is already in progress for this mailbox",
        existing_job_id: (existing[0] as { id: string }).id,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: job, error: jobErr } = await supabase
      .from("email_backfill_jobs")
      .insert({
        connection_id: connectionId,
        email_address: (conn as { email_address: string }).email_address,
        provider: (conn as { provider: string }).provider,
        target_window: target,
        status: "discovering",
      })
      .select("id")
      .single();
    if (jobErr || !job) throw new Error(jobErr?.message || "failed to create job");

    // Fire-and-forget discovery — never block the UI on the actual scan.
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/backfill-discover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ job_id: (job as { id: string }).id }),
    }).catch((e) => console.error("discover dispatch failed:", e));

    return new Response(JSON.stringify({ ok: true, job_id: (job as { id: string }).id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("start-email-backfill error:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
