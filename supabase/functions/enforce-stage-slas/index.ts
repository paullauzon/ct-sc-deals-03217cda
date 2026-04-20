// Enforce Pipeline v2 SLAs — runs every 15 minutes via pg_cron.
//
// For each active deal, checks time-in-stage against v2 SLA rules and
// inserts auto-tasks (idempotently — won't double-create the same SLA
// reminder for the same lead+stage pair within a 24h window).
//
// SLA rules (per the Pipeline v2 spec):
//   - Discovery Scheduled: meeting > 24h ago + no Fireflies URL → "Reconcile meeting"
//   - Sample Sent: > 5 days no sample_outcome → "Log sample outcome"
//   - Proposal Sent: > 3 days no movement → "Follow up on proposal"
//   - Proposal Sent: > 14 days → "Document stall reason" (warning chip)
//   - Negotiating: > 7 days no movement → "Push the close"
//
// All inserts go through `lead_tasks` with playbook = "sla-<rule>" so the
// UI can identify and group them separately from playbook-generated tasks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlaRule {
  id: string;
  /** v2 stage this rule applies to (we also check legacy aliases internally). */
  stage: string;
  legacyStages: string[];
  /** Days in stage before triggering. */
  thresholdDays: number;
  /** Optional extra predicate — return true to fire. */
  shouldFire?: (lead: any) => boolean;
  taskType: "email" | "call" | "internal" | "prep";
  title: string;
  description: string;
}

const SLA_RULES: SlaRule[] = [
  {
    id: "unassigned-stale",
    stage: "Unassigned",
    legacyStages: ["New Lead"],
    thresholdDays: 3,
    taskType: "email",
    title: "Send first outreach — inbound going cold",
    description: "Inbound lead has been Unassigned for 3+ days with no first touch. Send a personalized first email today before they forget they signed up.",
  },
  {
    id: "in-contact-stale",
    stage: "In Contact",
    legacyStages: ["Contacted", "Qualified"],
    thresholdDays: 4,
    taskType: "call",
    title: "Book the discovery — In Contact deal cooling",
    description: "Lead has been In Contact for 4+ days with no Discovery booked. Pick up the phone and lock a time today, or move to Closed Lost.",
  },
  {
    id: "discovery-scheduled-no-fireflies",
    stage: "Discovery Scheduled",
    legacyStages: ["Meeting Set"],
    thresholdDays: 1,
    shouldFire: (l) => {
      const meetings = Array.isArray(l.meetings) ? l.meetings : [];
      const hasFireflies = !!l.fireflies_url || meetings.some((m: any) => m.firefliesUrl || m.firefliesId);
      // Only fire if a meeting has actually happened (date in the past)
      const meetingDate = l.meeting_date ? new Date(l.meeting_date).getTime() : 0;
      const meetingPassed = meetingDate > 0 && meetingDate < Date.now() - 86400000;
      return meetingPassed && !hasFireflies;
    },
    taskType: "internal",
    title: "Reconcile meeting — sync Fireflies",
    description: "Meeting happened > 24h ago but no Fireflies recording is linked. Sync the transcript or log outcome manually.",
  },
  {
    id: "discovery-completed-no-sample",
    stage: "Discovery Completed",
    legacyStages: ["Meeting Held"],
    thresholdDays: 5,
    shouldFire: (l) => !l.sample_sent_date,
    taskType: "email",
    title: "Send sample or push to Closed Lost — no more graveyard",
    description: "Discovery completed 5+ days ago but no sample sent. Either ship the sample today (move to Sample Sent) or document why this should be Closed Lost. The whole point of the v2 pipeline is to stop deals dying here.",
  },
  {
    id: "sample-sent-no-outcome",
    stage: "Sample Sent",
    legacyStages: [],
    thresholdDays: 5,
    shouldFire: (l) => !l.sample_outcome,
    taskType: "email",
    title: "Log sample outcome",
    description: "Sample was sent over 5 days ago. Capture the outcome (Approved / Lukewarm / Needs revision / No response / Rejected) so we know whether to push to Proposal.",
  },
  {
    id: "proposal-sent-3day",
    stage: "Proposal Sent",
    legacyStages: [],
    thresholdDays: 3,
    taskType: "email",
    title: "Follow up on proposal",
    description: "Proposal has been outstanding for 3+ days. Send a low-pressure check-in.",
  },
  {
    id: "proposal-sent-stall",
    stage: "Proposal Sent",
    legacyStages: [],
    thresholdDays: 14,
    shouldFire: (l) => !l.stall_reason,
    taskType: "internal",
    title: "Document stall reason — proposal > 14 days",
    description: "Proposal has been open for 14+ days with no documented stall reason. Capture why so we can decide: push, discount, or close lost.",
  },
  {
    id: "negotiating-7day",
    stage: "Negotiating",
    legacyStages: ["Negotiation", "Contract Sent"],
    thresholdDays: 7,
    taskType: "call",
    title: "Push the close — direct call",
    description: "Negotiation has been open for a week. Get on the phone and surface the real blocker.",
  },
  {
    id: "proposal-sent-7d-silent-draft",
    stage: "Proposal Sent",
    legacyStages: [],
    thresholdDays: 7,
    taskType: "email",
    title: "Review AI stall-nudge draft",
    description: "Proposal has been silent 7+ days with no inbound reply. An AI soft-nudge draft has been generated in the Actions tab — review, edit, and send.",
  },
];

function daysInStage(stageEnteredDate: string | null): number {
  if (!stageEnteredDate) return 0;
  const t = new Date(stageEnteredDate).getTime();
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Fetch all active leads (not archived, not closed)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id, name, stage, stage_entered_date, meeting_date, fireflies_url, meetings, sample_outcome, stall_reason")
      .is("archived_at", null)
      .not("stage", "in", '("Closed Won","Closed Lost","Lost","Went Dark")');

    if (error) throw error;

    let created = 0;
    let skipped = 0;
    const summary: Record<string, number> = {};

    for (const lead of leads || []) {
      const days = daysInStage(lead.stage_entered_date);

      for (const rule of SLA_RULES) {
        const stageMatches = lead.stage === rule.stage || rule.legacyStages.includes(lead.stage);
        if (!stageMatches) continue;
        if (days < rule.thresholdDays) continue;
        if (rule.shouldFire && !rule.shouldFire(lead)) continue;

        // Idempotency — don't double-insert the same SLA task within 7 days
        const { data: existing } = await supabase
          .from("lead_tasks")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("playbook", `sla-${rule.id}`)
          .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        // Special case: stall-draft rule requires checking for inbound emails
        // and triggering generate-stage-draft
        if (rule.id === "proposal-sent-7d-silent-draft") {
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
          const { data: recentInbound } = await supabase
            .from("lead_emails")
            .select("id")
            .eq("lead_id", lead.id)
            .eq("direction", "inbound")
            .gte("email_date", sevenDaysAgo)
            .limit(1);
          if (recentInbound && recentInbound.length > 0) {
            skipped++;
            continue;
          }

          // Check if a stall draft already exists and is still pending
          const { data: existingDraft } = await supabase
            .from("lead_drafts")
            .select("id")
            .eq("lead_id", lead.id)
            .eq("action_key", "stage-stall-Proposal Sent")
            .eq("status", "draft")
            .limit(1);
          if (existingDraft && existingDraft.length > 0) {
            skipped++;
            continue;
          }

          // Invoke generate-stage-draft with trigger='stall'
          try {
            const draftRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-stage-draft`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  lead_id: lead.id,
                  new_stage: "Proposal Sent",
                  trigger: "stall",
                }),
              },
            );
            if (!draftRes.ok) {
              console.error(`generate-stage-draft failed for ${lead.id}:`, await draftRes.text());
            }
          } catch (e) {
            console.error(`generate-stage-draft invocation error for ${lead.id}:`, e);
          }
        }

        const dueDate = new Date().toISOString().split("T")[0];
        const { error: insertErr } = await supabase.from("lead_tasks").insert({
          lead_id: lead.id,
          playbook: `sla-${rule.id}`,
          sequence_order: 1,
          task_type: rule.taskType,
          title: rule.title,
          description: rule.description,
          due_date: dueDate,
          status: "pending",
        } as any);

        if (insertErr) {
          console.error(`SLA insert failed for ${lead.id}:`, insertErr);
          continue;
        }

        // Audit log
        await supabase.from("lead_activity_log").insert({
          lead_id: lead.id,
          event_type: "sla_task_created",
          description: `SLA: ${rule.title} (${days}d in ${lead.stage})`,
          new_value: rule.id,
        } as any);

        created++;
        summary[rule.id] = (summary[rule.id] || 0) + 1;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        leads_checked: leads?.length || 0,
        tasks_created: created,
        tasks_skipped_idempotent: skipped,
        by_rule: summary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("enforce-stage-slas error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
