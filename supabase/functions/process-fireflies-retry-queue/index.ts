// Retry runner for broken Fireflies transcripts.
// Picks up `pending` rows in fireflies_retry_queue whose next_attempt_at <= now(),
// re-fetches the transcript via fetch-fireflies (mode=re-fetch), patches the
// owning lead's meetings JSON on success, and applies exponential backoff on
// failure. Marks the row `gave_up` after max_attempts.
//
// Schedule: every 15 minutes via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BACKOFF_MINUTES = [5, 30, 120, 360, 1440]; // 5m, 30m, 2h, 6h, 24h

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const startedAt = new Date().toISOString();
  let processed = 0;
  let recovered = 0;
  let gaveUp = 0;
  let stillFailing = 0;
  const errors: string[] = [];

  try {
    const { data: dueRows, error: dueErr } = await supabase
      .from("fireflies_retry_queue")
      .select("id, fireflies_id, lead_id, attempts, max_attempts")
      .eq("status", "pending")
      .lte("next_attempt_at", startedAt)
      .order("next_attempt_at", { ascending: true })
      .limit(20);

    if (dueErr) throw dueErr;
    const rows = dueRows ?? [];

    // Group by lead to fetch their meetings once
    const leadIds = Array.from(new Set(rows.map(r => r.lead_id)));
    const leadMap = new Map<string, { brand: string; meetings: any[] }>();
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("id, brand, meetings")
        .in("id", leadIds);
      (leads ?? []).forEach((l: any) =>
        leadMap.set(l.id, { brand: l.brand || "Captarget", meetings: Array.isArray(l.meetings) ? l.meetings : [] })
      );
    }

    for (const row of rows) {
      processed++;
      const lead = leadMap.get(row.lead_id);
      if (!lead) {
        await markGaveUp(supabase, row.id, "Lead not found");
        gaveUp++;
        continue;
      }

      try {
        const ffRes = await fetch(`${SUPABASE_URL}/functions/v1/fetch-fireflies`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ mode: "re-fetch", brand: lead.brand, firefliesIds: [row.fireflies_id] }),
        });
        const json = await ffRes.json().catch(() => ({}));
        const result = (json?.results || []).find((r: any) => r.id === row.fireflies_id);

        if (result?.ok && result.transcript && result.transcript.length > 0) {
          // Patch the meeting in the lead
          const updatedMeetings = lead.meetings.map((m: any) =>
            m?.firefliesId === row.fireflies_id
              ? { ...m, transcript: result.transcript, transcriptLength: result.transcriptLength ?? result.transcript.length }
              : m
          );
          const { error: upErr } = await supabase
            .from("leads")
            .update({ meetings: updatedMeetings })
            .eq("id", row.lead_id);

          if (upErr) throw upErr;

          await supabase
            .from("fireflies_retry_queue")
            .update({ status: "done", attempts: row.attempts + 1, last_error: "", updated_at: startedAt })
            .eq("id", row.id);
          recovered++;
        } else {
          await scheduleNextAttempt(supabase, row, result?.error || "Empty transcript returned");
          if (row.attempts + 1 >= row.max_attempts) gaveUp++; else stillFailing++;
        }
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200);
        errors.push(msg);
        await scheduleNextAttempt(supabase, row, msg);
        if (row.attempts + 1 >= row.max_attempts) gaveUp++; else stillFailing++;
      }
    }

    await logRun(supabase, "process-fireflies-retry-queue", "success", processed, {
      recovered, gaveUp, stillFailing,
    });

    return new Response(JSON.stringify({ ok: true, processed, recovered, gaveUp, stillFailing }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logRun(supabase, "process-fireflies-retry-queue", "error", processed, { errors }, msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function scheduleNextAttempt(supabase: any, row: any, errMsg: string) {
  const nextAttempts = row.attempts + 1;
  if (nextAttempts >= row.max_attempts) {
    await markGaveUp(supabase, row.id, errMsg);
    return;
  }
  const delay = BACKOFF_MINUTES[Math.min(nextAttempts, BACKOFF_MINUTES.length - 1)];
  const next = new Date(Date.now() + delay * 60 * 1000).toISOString();
  await supabase
    .from("fireflies_retry_queue")
    .update({
      attempts: nextAttempts,
      next_attempt_at: next,
      last_error: errMsg.slice(0, 200),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

async function markGaveUp(supabase: any, id: string, errMsg: string) {
  await supabase
    .from("fireflies_retry_queue")
    .update({ status: "gave_up", last_error: errMsg.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function logRun(supabase: any, jobName: string, status: string, items: number, details: any, errorMessage = "") {
  try {
    await supabase.from("cron_run_log").insert({
      job_name: jobName, status, items_processed: items, details, error_message: errorMessage,
    });
  } catch {/* swallow */}
}
