// Phase 7 — email-workflow-trigger
// Tiny rules-based reactor that runs every 5 minutes and applies three behaviors:
//
//   1. Inbound reply on a lead in active nurture → unenroll from nurture.
//   2. Outbound silence ≥14d on an active deal → log a break-up suggestion
//      activity (does not auto-send; surfaces in the Action Center).
//   3. Open detected after a long stall (>10d outbound silence) → log a
//      "thread re-engaged" activity entry visible in Signals + Activity tab.
//
// All actions are idempotent: each rule writes a marker activity row so the
// trigger only fires once per email/lead state transition.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logCronRun } from "../_shared/cron-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JOB_NAME = "email-workflow-trigger";

const ACTIVE_DEAL_STAGES = [
  "Discovery Completed", "Sample Sent", "Proposal Sent", "Negotiating",
  "Meeting Set", "Meeting Held",
];

async function rule_unenrollOnReply(sb: any) {
  // Find inbound emails in last 6h on leads currently in active nurture
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data: inbound } = await sb
    .from("lead_emails")
    .select("id, lead_id, email_date, from_address")
    .eq("direction", "inbound")
    .gte("email_date", since)
    .neq("lead_id", "unmatched");

  let unenrolled = 0;
  for (const e of inbound || []) {
    const { data: lead } = await sb
      .from("leads")
      .select("id, nurture_sequence_status, name")
      .eq("id", e.lead_id)
      .maybeSingle();
    if (!lead || lead.nurture_sequence_status !== "active") continue;

    await sb.from("leads").update({
      nurture_sequence_status: "re_engaged",
      nurture_exit_reason: "Replied while in nurture",
      stage: "In Contact",
      stage_entered_date: new Date().toISOString().slice(0, 10),
    }).eq("id", e.lead_id);

    await sb.from("lead_activity_log").insert({
      lead_id: e.lead_id,
      event_type: "workflow_trigger",
      description: `Auto-unenrolled from nurture — inbound reply received`,
      metadata: { rule: "unenroll_on_reply", email_id: e.id },
      actor_name: "Workflow",
    });
    unenrolled++;
  }
  return unenrolled;
}

async function rule_breakUpOnSilence(sb: any) {
  // For each active deal, find ones whose last outbound was 14-21d ago AND
  // no inbound since AND no break-up suggestion in the last 30d.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 86400 * 1000).toISOString();

  const { data: leads } = await sb
    .from("leads")
    .select("id, name, stage")
    .in("stage", ACTIVE_DEAL_STAGES)
    .is("archived_at", null)
    .limit(500);

  let suggested = 0;
  for (const lead of leads || []) {
    const { data: metrics } = await sb
      .from("lead_email_metrics")
      .select("last_sent_date, last_received_date")
      .eq("lead_id", lead.id)
      .maybeSingle();
    if (!metrics?.last_sent_date) continue;

    const lastSent = new Date(metrics.last_sent_date).getTime();
    if (lastSent > new Date(fourteenDaysAgo).getTime()) continue;        // too recent
    if (lastSent < new Date(twentyOneDaysAgo).getTime()) continue;       // already past window
    if (metrics.last_received_date && new Date(metrics.last_received_date).getTime() > lastSent) continue;

    // Avoid duplicate suggestions in last 30d
    const thirtyAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: existing } = await sb
      .from("lead_activity_log")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("event_type", "workflow_trigger")
      .gte("created_at", thirtyAgo)
      .like("description", "%break-up%")
      .limit(1);
    if (existing && existing.length > 0) continue;

    await sb.from("lead_activity_log").insert({
      lead_id: lead.id,
      event_type: "workflow_trigger",
      description: `Suggested: send a break-up email — 14+ days of silence on an active deal`,
      metadata: { rule: "breakup_on_silence", last_sent: metrics.last_sent_date },
      actor_name: "Workflow",
    });
    suggested++;
  }
  return suggested;
}

async function rule_openAfterStall(sb: any) {
  // Detect new opens (last 30 min) on outbound emails where the previous
  // engagement was >10d ago. Logs a single "thread re-engaged" activity
  // per email per 7d.
  const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
  const { data: emails } = await sb
    .from("lead_emails")
    .select("id, lead_id, opens, email_date, subject")
    .eq("direction", "outbound")
    .neq("lead_id", "unmatched")
    .order("email_date", { ascending: false })
    .limit(200);

  let logged = 0;
  for (const e of emails || []) {
    const opens = Array.isArray(e.opens) ? e.opens : [];
    if (opens.length < 2) continue;  // need history + new
    // Sort opens by ts
    const stamps = opens
      .map((o: any) => {
        const ts = new Date(o?.timestamp || o?.ts || o).getTime();
        return Number.isFinite(ts) ? ts : null;
      })
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    if (stamps.length < 2) continue;
    const newest = stamps[stamps.length - 1];
    const prev = stamps[stamps.length - 2];
    if (newest < thirtyMinAgo) continue;       // not a fresh open
    if (newest - prev < 10 * 86400 * 1000) continue;  // not a stall

    // Idempotency: skip if logged in last 7d
    const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const { data: existing } = await sb
      .from("lead_activity_log")
      .select("id")
      .eq("lead_id", e.lead_id)
      .eq("event_type", "workflow_trigger")
      .gte("created_at", sevenAgo)
      .like("description", "%re-engaged%")
      .limit(1);
    if (existing && existing.length > 0) continue;

    await sb.from("lead_activity_log").insert({
      lead_id: e.lead_id,
      event_type: "workflow_trigger",
      description: `Thread re-engaged — buyer opened "${e.subject || "(no subject)"}" after long silence`,
      metadata: { rule: "open_after_stall", email_id: e.id, gap_days: Math.round((newest - prev) / 86400000) },
      actor_name: "Workflow",
    });
    logged++;
  }
  return logged;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  let unenrolled = 0, suggested = 0, reEngaged = 0;
  try {
    unenrolled = await rule_unenrollOnReply(sb);
    suggested = await rule_breakUpOnSilence(sb);
    reEngaged = await rule_openAfterStall(sb);

    const total = unenrolled + suggested + reEngaged;
    const status = total === 0 ? "noop" : "success";
    await logCronRun(JOB_NAME, status, total, { unenrolled, suggested, reEngaged });
    return new Response(JSON.stringify({ ok: true, unenrolled, suggested, reEngaged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logCronRun(JOB_NAME, "error", 0, { unenrolled, suggested, reEngaged }, e?.message || String(e));
    return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
