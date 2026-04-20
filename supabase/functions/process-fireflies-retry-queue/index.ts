// Retry runner for broken Fireflies transcripts.
//
// On each tick (every 15 min via pg_cron) this function:
//   1. AUTO-BOOTSTRAP: if the retry queue is empty AND there are leads with a
//      fireflies_url but a missing/short transcript, enqueue up to 30 of them
//      with staggered next_attempt_at (2 min apart) so we don't spike the
//      Fireflies API. This eliminates the "manual button nobody clicks"
//      failure mode for the existing 110-lead backlog.
//   2. DRAIN: pick up `pending` rows whose next_attempt_at <= now(),
//      re-fetch the transcript via fetch-fireflies (mode=re-fetch),
//      patch the owning lead's meetings JSON on success, and apply
//      exponential backoff on failure. Marks the row `gave_up` after
//      max_attempts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BACKOFF_MINUTES = [5, 30, 120, 360, 1440]; // 5m, 30m, 2h, 6h, 24h
const JOB_NAME = "process-fireflies-retry-queue";
const BOOTSTRAP_BATCH_SIZE = 30;
const BOOTSTRAP_STAGGER_MIN = 2;

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
  let bootstrapped = 0;
  const errors: string[] = [];

  try {
    // ── 1. Auto-bootstrap: if queue is empty, seed broken leads ──
    const { count: queueCount } = await supabase
      .from("fireflies_retry_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if ((queueCount ?? 0) === 0) {
      const { data: brokenLeads } = await supabase
        .from("leads")
        .select("id, fireflies_url, fireflies_transcript, meetings")
        .is("archived_at", null)
        .neq("fireflies_url", "")
        .limit(200);

      const candidates: { lead_id: string; fireflies_id: string }[] = [];
      for (const l of (brokenLeads ?? [])) {
        const meetings = Array.isArray(l.meetings) ? l.meetings : [];
        for (const m of meetings) {
          const tlen = (m?.transcript || "").length;
          if (m?.firefliesId && tlen < 200) {
            candidates.push({ lead_id: l.id, fireflies_id: m.firefliesId });
            if (candidates.length >= BOOTSTRAP_BATCH_SIZE) break;
          }
        }
        if (candidates.length >= BOOTSTRAP_BATCH_SIZE) break;
      }

      if (candidates.length > 0) {
        // Filter out any already-queued (status != pending) so we don't duplicate
        const ffIds = candidates.map(c => c.fireflies_id);
        const { data: existing } = await supabase
          .from("fireflies_retry_queue")
          .select("fireflies_id")
          .in("fireflies_id", ffIds);
        const existingSet = new Set((existing ?? []).map((r: any) => r.fireflies_id));

        const rowsToInsert = candidates
          .filter(c => !existingSet.has(c.fireflies_id))
          .map((c, i) => ({
            lead_id: c.lead_id,
            fireflies_id: c.fireflies_id,
            status: "pending",
            attempts: 0,
            max_attempts: 5,
            next_attempt_at: new Date(Date.now() + i * BOOTSTRAP_STAGGER_MIN * 60 * 1000).toISOString(),
            last_error: "auto-bootstrapped from broken transcript",
          }));

        if (rowsToInsert.length > 0) {
          await supabase.from("fireflies_retry_queue").insert(rowsToInsert);
          bootstrapped = rowsToInsert.length;
        }
      }
    }

    // ── 2. Drain: process due rows ──
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

    // Always log — including no-ops where nothing was due AND nothing was bootstrapped
    const status = (processed === 0 && bootstrapped === 0) ? "noop" : "success";
    await logCronRun(JOB_NAME, status, processed, {
      recovered, gaveUp, stillFailing, bootstrapped, errorSamples: errors.slice(0, 3),
    });

    return new Response(JSON.stringify({ ok: true, processed, recovered, gaveUp, stillFailing, bootstrapped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logCronRun(JOB_NAME, "error", processed, { errors }, msg);
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
