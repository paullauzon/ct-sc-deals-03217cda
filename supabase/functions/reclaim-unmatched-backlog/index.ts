// Round 9 — repurposed: this endpoint now ENQUEUES a `reclaim_jobs` row.
// The actual processing is done by `reclaim-unmatched-tick` running every
// 2 minutes via pg_cron, which can survive page reloads and edge timeouts.
//
// Returns the job_id immediately so the UI can poll progress.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Refuse to start a duplicate job
    const { data: existing } = await supabase
      .from("reclaim_jobs")
      .select("id")
      .eq("status", "running")
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        ok: true,
        already_running: true,
        job_id: existing[0].id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Compute total to give the UI a denominator
    const { count } = await supabase
      .from("lead_emails")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", "unmatched");

    const { data: created, error } = await supabase
      .from("reclaim_jobs")
      .insert({
        status: "running",
        total_remaining: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Trigger the first tick immediately so progress starts without waiting
    // 2 minutes for the cron — fire and forget.
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/reclaim-unmatched-tick`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: "{}",
      }).catch(() => {});
    } catch {}

    return new Response(JSON.stringify({
      ok: true,
      job_id: created.id,
      total_remaining: count ?? 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
