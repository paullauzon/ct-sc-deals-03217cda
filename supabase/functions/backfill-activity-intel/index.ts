import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * One-time data hygiene job for the Activities tab. Two operations:
 *
 *   1. Backfill `sequence_paused` activity rows for any inbound email that has
 *      `replied_at` set (i.e. it was matched as a reply to an outbound) when the
 *      matched outbound carried a `sequence_step` and no pause row exists yet.
 *
 *   2. Backfill `metadata.intel` on `call_logged` activity rows that pre-date the
 *      `extract-call-intel` rollout. Calls `extract-call-intel` for each summary
 *      and writes the structured JSON into `metadata.intel`.
 *
 * Both passes are idempotent — re-running is safe.
 *
 * Body: { mode?: "pauses" | "calls" | "all", lead_id?: string, limit?: number }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const mode = (body.mode as string) || "all";
    const leadFilter = (body.lead_id as string) || "";
    const limit = Math.min(Number(body.limit) || 500, 2000);

    const summary = { pauses_inserted: 0, pauses_skipped: 0, calls_enriched: 0, calls_skipped: 0, errors: [] as string[] };

    // ── Pass 1: sequence_paused backfill ───────────────────────────────────
    if (mode === "all" || mode === "pauses") {
      // Fetch inbound replies. We only care about ones whose matched outbound
      // (same thread) carried a sequence_step.
      let q = supabase
        .from("lead_emails")
        .select("id,lead_id,thread_id,email_date")
        .eq("direction", "inbound")
        .not("thread_id", "is", null)
        .order("email_date", { ascending: false })
        .limit(limit);
      if (leadFilter) q = q.eq("lead_id", leadFilter);
      const { data: inbound, error: inErr } = await q;
      if (inErr) summary.errors.push(`inbound fetch: ${inErr.message}`);

      for (const row of inbound || []) {
        try {
          // Find outbound on the same thread that carries a sequence_step
          const { data: outRow } = await supabase
            .from("lead_emails")
            .select("id,sequence_step")
            .eq("lead_id", row.lead_id)
            .eq("thread_id", row.thread_id)
            .eq("direction", "outbound")
            .not("sequence_step", "is", null)
            .order("email_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          const step = outRow?.sequence_step;
          if (!step) { summary.pauses_skipped++; continue; }

          // Skip if a pause row for this inbound already exists (idempotency)
          const { data: existing } = await supabase
            .from("lead_activity_log")
            .select("id")
            .eq("lead_id", row.lead_id)
            .eq("event_type", "sequence_paused")
            .contains("metadata", { inbound_email_id: row.id } as any)
            .limit(1);
          if (existing && existing.length > 0) { summary.pauses_skipped++; continue; }

          await supabase.from("lead_activity_log").insert({
            lead_id: row.lead_id,
            event_type: "sequence_paused",
            description: `Sequence ${step} auto-paused on reply`,
            new_value: step,
            metadata: { trigger: "inbound_reply_backfill", inbound_email_id: row.id },
            created_at: row.email_date,
          });
          summary.pauses_inserted++;
        } catch (e) {
          summary.errors.push(`pause ${row.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // ── Pass 2: call intel backfill ────────────────────────────────────────
    if (mode === "all" || mode === "calls") {
      let q = supabase
        .from("lead_activity_log")
        .select("id,lead_id,description,metadata")
        .eq("event_type", "call_logged")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (leadFilter) q = q.eq("lead_id", leadFilter);
      const { data: calls, error: callErr } = await q;
      if (callErr) summary.errors.push(`calls fetch: ${callErr.message}`);

      for (const row of calls || []) {
        try {
          const meta = (row.metadata as Record<string, unknown>) || {};
          if ((meta as any).intel) { summary.calls_skipped++; continue; }
          const summaryText = (meta as any).summary as string | undefined;
          if (!summaryText || summaryText.trim().length < 40) { summary.calls_skipped++; continue; }

          const outcome = (row.description.match(/Call logged: ([^·]+)/i)?.[1] || "Connected").trim();
          const duration = (row.description.match(/(\d+)m/)?.[1] || "");

          const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-call-intel`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({ summary: summaryText, outcome, duration }),
          });
          if (!resp.ok) { summary.calls_skipped++; continue; }
          const json = await resp.json();
          const intel = json?.intel;
          if (!intel) { summary.calls_skipped++; continue; }

          await supabase
            .from("lead_activity_log")
            .update({ metadata: { ...meta, intel } as any })
            .eq("id", row.id);
          summary.calls_enriched++;
        } catch (e) {
          summary.errors.push(`call ${row.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("backfill-activity-intel error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
