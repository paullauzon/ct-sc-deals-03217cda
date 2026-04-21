// Cron drainer for the Fireflies backfill queue.
//
// Each tick (every 10 min) claims up to MAX_PER_TICK rows where
// `fireflies_id LIKE 'backfill:%'` and `next_attempt_at <= now()`, then for
// each row:
//   1. Loads the lead's calendly_booked_at + email + name + brand.
//   2. Calls fetch-fireflies with searchEmails/searchNames + a `since` window
//      48h before the booking, and post-filters returned transcripts to those
//      whose date is within ±48h of the booking.
//   3. On match: writes lead-level transcript/summary/url, appends to
//      meetings[], fires process-meeting (best-effort, fire-and-forget) for
//      AI intel extraction, and marks the queue row 'done'.
//   4. On no match: backoff (5m → 30m → 2h) up to max_attempts, then 'gave_up'
//      with reason 'not_in_fireflies_api'.
//
// Throughput: 8 leads / 10min = ~48/hr. Safe under 100s wall-time and
// Fireflies rate limits because we serialize the searches.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_NAME = "process-fireflies-backfill-queue";
// Each Fireflies search takes 10-30s (paginates 20 metadata batches + speaker-name
// fallback). At MAX_PER_TICK=20 we routinely blew past the 150s edge function
// idle timeout. 5 leads × ~25s = ~125s, safely under the cap with headroom for
// the final DB writes. Pair with WALL_BUDGET_MS as a hard escape hatch.
const MAX_PER_TICK = 5;
// Edge gateway kills at ~150s. Each lead's Fireflies search takes 10-30s
// (depends on rate-limit retries). Cap the loop at 90s so we always have
// 60+ seconds of headroom to write the final logCronRun before a kill.
// Without this headroom, the heartbeat row never lands and the panel shows
// "Stale" even though the underlying work is committing successfully.
const WALL_BUDGET_MS = 90_000;
const WINDOW_HOURS = 48;
const BACKOFF_MINUTES = [5, 30, 120]; // attempt 1 → 5m, 2 → 30m, 3 → 2h

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
  let stillSearching = 0;
  const errors: string[] = [];

  try {
    const { data: dueRows, error: dueErr } = await supabase
      .from("fireflies_retry_queue")
      .select("id, fireflies_id, lead_id, attempts, max_attempts")
      .eq("status", "pending")
      .like("fireflies_id", "backfill:%")
      .lte("next_attempt_at", startedAt)
      .order("next_attempt_at", { ascending: true })
      .limit(MAX_PER_TICK);

    if (dueErr) throw dueErr;
    const rows = dueRows ?? [];

    if (rows.length === 0) {
      await logCronRun(JOB_NAME, "noop", 0, { note: "no backfill rows due", recovered: 0, gaveUp: 0, stillSearching: 0 });
      return new Response(JSON.stringify({ ok: true, processed: 0, recovered: 0, gaveUp: 0, stillSearching: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Heartbeat: log a "running" row IMMEDIATELY so the panel sees the tick
    // even if the function gets killed mid-loop by the 150s gateway timeout.
    // Without this, killed runs leave no log entry and the panel falsely
    // reports "Stale" while work is actually committing under the hood.
    await logCronRun(JOB_NAME, "success", 0, {
      heartbeat: true, claimed: rows.length, startedAt,
      note: "tick started — final stats will overwrite if completion reached",
    });

    // Load lead context once per tick.
    const leadIds = Array.from(new Set(rows.map(r => r.lead_id)));
    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, email, brand, company, company_url, secondary_contacts, calendly_booked_at, meetings, fireflies_transcript")
      .in("id", leadIds);
    const leadMap = new Map<string, any>();
    (leads ?? []).forEach((l: any) => leadMap.set(l.id, l));

    const tickStart = Date.now();
    for (const row of rows) {
      // Hard wall-clock guard — bail BEFORE starting another lead if we're close
      // to the 150s edge timeout. Remaining rows stay 'pending' for the next tick.
      if (Date.now() - tickStart > WALL_BUDGET_MS) {
        errors.push(`wall-budget reached after ${processed} leads, deferring rest`);
        break;
      }
      processed++;
      const lead = leadMap.get(row.lead_id);
      if (!lead) {
        await markGaveUp(supabase, row.id, "lead not found");
        gaveUp++;
        continue;
      }

      // Skip if some other process already filled the transcript.
      if ((lead.fireflies_transcript || "").length >= 200) {
        await supabase
          .from("fireflies_retry_queue")
          .update({ status: "done", attempts: row.attempts + 1, last_error: "already_filled", updated_at: startedAt })
          .eq("id", row.id);
        recovered++;
        continue;
      }

      const bookedAtRaw = (lead.calendly_booked_at || "").trim();
      const bookedTs = bookedAtRaw ? Date.parse(bookedAtRaw) : NaN;
      if (!bookedAtRaw || Number.isNaN(bookedTs)) {
        await markGaveUp(supabase, row.id, "invalid calendly_booked_at");
        gaveUp++;
        continue;
      }

      try {
        // Build search inputs from the lead.
        const emails = new Set<string>();
        if (lead.email) emails.add(String(lead.email).toLowerCase().trim());
        const sec = Array.isArray(lead.secondary_contacts) ? lead.secondary_contacts : [];
        for (const c of sec) {
          if (c?.email) emails.add(String(c.email).toLowerCase().trim());
        }
        const names: string[] = lead.name ? [String(lead.name).trim()] : [];
        const domains = new Set<string>();
        for (const e of emails) {
          const d = e.split("@")[1];
          if (d && !["gmail.com","yahoo.com","outlook.com","hotmail.com","icloud.com","aol.com"].includes(d)) {
            domains.add(d);
          }
        }
        if (lead.company_url) {
          try {
            const u = new URL(lead.company_url.startsWith("http") ? lead.company_url : `https://${lead.company_url}`);
            const d = u.hostname.replace(/^www\./, "");
            if (d) domains.add(d);
          } catch { /* ignore */ }
        }

        const sinceIso = new Date(bookedTs - WINDOW_HOURS * 3600 * 1000).toISOString();
        const untilTs = bookedTs + WINDOW_HOURS * 3600 * 1000;

        const ffRes = await fetch(`${SUPABASE_URL}/functions/v1/fetch-fireflies`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({
            brand: lead.brand || "Captarget",
            since: sinceIso,
            limit: 200,
            searchEmails: Array.from(emails),
            searchNames: names,
            searchDomains: Array.from(domains),
            searchLeadName: lead.name || "",
          }),
        });

        if (!ffRes.ok) {
          const txt = await ffRes.text().catch(() => "");
          throw new Error(`fetch-fireflies ${ffRes.status}: ${txt.slice(0, 120)}`);
        }
        const ffJson = await ffRes.json().catch(() => ({}));
        const transcripts: any[] = Array.isArray(ffJson?.transcripts) ? ffJson.transcripts : [];

        // Pick best candidate within ±WINDOW_HOURS of booking, prefer longest transcript.
        const candidates = transcripts
          .map(t => {
            const d = t?.date ? Date.parse(t.date) : (t?.dateNumeric ? Number(t.dateNumeric) : NaN);
            return { t, d, len: (t?.transcript || "").length };
          })
          .filter(c => !Number.isNaN(c.d) && c.d >= bookedTs - WINDOW_HOURS * 3600 * 1000 && c.d <= untilTs)
          .sort((a, b) => b.len - a.len);

        const winner = candidates[0]?.t;

        if (winner && (winner.transcript || "").length > 0) {
          const ffId = winner.id || winner.firefliesId || "";
          const meetingDateIso = winner.date ? new Date(winner.date).toISOString() : new Date(bookedTs).toISOString();
          const transcriptLen = (winner.transcript || "").length;
          const summary = winner.summary || winner.summaryText || "";
          const url = winner.transcript_url || winner.url || (ffId ? `https://app.fireflies.ai/view/${ffId}` : "");

          // Append to meetings[] if not already present (by ffId).
          const existing = Array.isArray(lead.meetings) ? lead.meetings : [];
          const alreadyHas = ffId && existing.some((m: any) => m?.firefliesId === ffId);
          const updatedMeetings = alreadyHas ? existing : [
            ...existing,
            {
              firefliesId: ffId,
              title: winner.title || "Fireflies meeting",
              date: meetingDateIso,
              duration: winner.duration || 0,
              transcript: winner.transcript,
              transcriptLength: transcriptLen,
              summary,
              actionItems: winner.actionItems || [],
              source: "calendly-backfill",
            },
          ];

          const { error: upErr } = await supabase
            .from("leads")
            .update({
              fireflies_transcript: winner.transcript,
              fireflies_summary: summary || undefined,
              fireflies_url: url || undefined,
              meetings: updatedMeetings,
            })
            .eq("id", row.lead_id);
          if (upErr) throw upErr;

          // Fire-and-forget AI intel extraction (don't block the tick budget).
          fetch(`${SUPABASE_URL}/functions/v1/process-meeting`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
            body: JSON.stringify({ leadId: row.lead_id, firefliesId: ffId }),
          }).catch(() => { /* best-effort */ });

          await supabase
            .from("fireflies_retry_queue")
            .update({ status: "done", attempts: row.attempts + 1, last_error: `matched:${ffId}`, updated_at: startedAt })
            .eq("id", row.id);
          recovered++;
          // Per-item log — drives the live drawer's event stream so users see
          // exactly which lead was matched in real time. Cheap insert, fire-and-forget.
          void logCronRun(JOB_NAME, "success", 1, {
            item: `lead ${row.lead_id}`, classification: `matched (transcript ${transcriptLen} chars)`,
          });
        } else {
          // No match within window — terminal (Fireflies retention miss).
          await scheduleNextOrGiveUp(supabase, row, "not_in_fireflies_api");
          gaveUp++;
          void logCronRun(JOB_NAME, "success", 1, {
            item: `lead ${row.lead_id}`, classification: "gave_up · not_in_fireflies_api",
          });
        }
      } catch (e) {
        const msg = (e as Error).message.slice(0, 200);
        errors.push(msg);
        await scheduleNextOrGiveUp(supabase, row, msg);
        if (row.attempts + 1 >= row.max_attempts) gaveUp++; else stillSearching++;
      }
    }

    const status = processed === 0 ? "noop" : "success";
    await logCronRun(JOB_NAME, status, processed, {
      recovered, gaveUp, stillSearching, errorSamples: errors.slice(0, 3),
    });

    return new Response(JSON.stringify({ ok: true, processed, recovered, gaveUp, stillSearching }), {
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

async function scheduleNextOrGiveUp(supabase: any, row: any, errMsg: string) {
  // Fail-fast: when Fireflies simply doesn't have the meeting (likely past
  // their ~90d retention window), retrying is pointless. Mark gave_up
  // immediately so the queue drains in minutes instead of hours. Only
  // backoff on transient errors (HTTP 5xx, timeouts, rate limits, etc.).
  const isTerminal = errMsg === "not_in_fireflies_api"
    || errMsg === "lead not found"
    || errMsg === "invalid calendly_booked_at";
  if (isTerminal) {
    await markGaveUp(supabase, row.id, errMsg);
    return;
  }
  const next = row.attempts + 1;
  if (next >= row.max_attempts) {
    await markGaveUp(supabase, row.id, errMsg);
    return;
  }
  const delay = BACKOFF_MINUTES[Math.min(next, BACKOFF_MINUTES.length - 1)];
  const at = new Date(Date.now() + delay * 60 * 1000).toISOString();
  await supabase
    .from("fireflies_retry_queue")
    .update({
      attempts: next,
      next_attempt_at: at,
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
