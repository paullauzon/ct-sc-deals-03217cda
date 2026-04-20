// One-time backfill — generates v2 playbook tasks for every active deal that
// is missing them. Idempotent: skips any (lead, playbook) pair that already
// has at least one task on file. Safe to re-run.
//
// Invoke: POST /functions/v1/backfill-stage-v2-tasks { "dryRun": false }

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── v2 stage → playbook (mirrors src/lib/playbooks.ts) ──────────────────────
const STAGE_LABEL_MAP: Record<string, string> = {
  "New Lead": "Unassigned",
  "Qualified": "In Contact", "Contacted": "In Contact",
  "Meeting Set": "Discovery Scheduled",
  "Meeting Held": "Discovery Completed",
  "Negotiation": "Negotiating", "Contract Sent": "Negotiating",
  "Revisit/Reconnect": "Closed Lost", "Lost": "Closed Lost", "Went Dark": "Closed Lost",
};
const normalizeStage = (s: string) => STAGE_LABEL_MAP[s] ?? s;

interface Step {
  dayOffset: number;
  taskType: string;
  title: string;
  description: string;
}

const PLAYBOOKS: Record<string, { id: string; steps: Step[] }> = {
  "Unassigned": { id: "unassigned", steps: [
    { dayOffset: 0, taskType: "email", title: "Send initial outreach", description: "Personalized first-touch email referencing their submission and a clear next step." },
    { dayOffset: 3, taskType: "email", title: "Different angle follow-up", description: "Try a different value angle if no response." },
    { dayOffset: 7, taskType: "internal", title: "LinkedIn touchpoint", description: "Connect on LinkedIn with a personalized note." },
  ]},
  "In Contact": { id: "in-contact", steps: [
    { dayOffset: 1, taskType: "email", title: "Confirm interest, propose discovery call", description: "Confirm fit, share 2-3 time slots, set agenda expectation." },
    { dayOffset: 5, taskType: "email", title: "Re-nudge if no booking", description: "Tighter ask with concrete value statement." },
    { dayOffset: 10, taskType: "internal", title: "Decide: keep or close-lost", description: "If no movement after 10 days, close lost or move to nurture." },
  ]},
  "Discovery Scheduled": { id: "discovery-scheduled", steps: [
    { dayOffset: 0, taskType: "email", title: "Send confirmation + agenda preview", description: "Confirm meeting, share 2-3 talking points tailored to their needs." },
    { dayOffset: -1, taskType: "prep", title: "Auto-generate prep brief", description: "Generate full pre-meeting intelligence brief." },
    { dayOffset: 1, taskType: "email", title: "Post-meeting recap", description: "Send recap of key takeaways, agreed next steps, and timeline." },
  ]},
  "Discovery Completed": { id: "discovery-completed", steps: [
    { dayOffset: 1, taskType: "email", title: "Send recap + sample plan", description: "Summarize discovery, propose what the sample will demonstrate, set a delivery date." },
    { dayOffset: 3, taskType: "internal", title: "Build & send sample", description: "Produce sample (targets list / call script / proof) and send before momentum decays." },
    { dayOffset: 7, taskType: "email", title: "Check-in if no sample sent yet", description: "If sample hasn't shipped, escalate internally and notify prospect of status." },
  ]},
  "Sample Sent": { id: "sample-sent", steps: [
    { dayOffset: 2, taskType: "email", title: "Day-2 check-in: any reactions?", description: "Light-touch check-in — ask if the sample landed, soliciting initial reactions." },
    { dayOffset: 5, taskType: "email", title: "Day-5: log sample outcome", description: "Direct ask — was the sample useful? Capture sampleOutcome on the record." },
    { dayOffset: 10, taskType: "call", title: "Day-10 nudge call", description: "If still no response, jump on a quick call to unblock and confirm next step." },
    { dayOffset: 14, taskType: "internal", title: "Decide: proposal or nurture", description: "If sample feedback positive → move to Proposal Sent. If silent → nurture or close lost." },
  ]},
  "Proposal Sent": { id: "proposal-sent", steps: [
    { dayOffset: 2, taskType: "email", title: "\"Any questions?\" check-in", description: "Brief, low-pressure follow-up asking if they need any clarification." },
    { dayOffset: 5, taskType: "email", title: "Value-add follow-up", description: "Share a relevant case study or ROI proof that reinforces the proposal." },
    { dayOffset: 10, taskType: "email", title: "Direct ask + negotiation nudge", description: "Ask about timeline and decision process; surface any blockers." },
    { dayOffset: 14, taskType: "internal", title: "Require stall reason if no movement", description: "If proposal still open after 14 days, document why and decide next move." },
  ]},
  "Negotiating": { id: "negotiating", steps: [
    { dayOffset: 1, taskType: "email", title: "Send contract / terms doc", description: "Push the paper. Confirm contract structure, payment terms, start date." },
    { dayOffset: 3, taskType: "email", title: "Follow up on signature", description: "Polite nudge — any blockers on signing? Anything to clarify?" },
    { dayOffset: 7, taskType: "call", title: "Direct close call", description: "Get on the phone — close the deal or surface the real blocker." },
  ]},
};

function tasksFor(playbookKey: string, leadId: string, anchor: Date) {
  const pb = PLAYBOOKS[playbookKey];
  if (!pb) return [];
  return pb.steps.map((step, i) => {
    const due = new Date(anchor);
    due.setDate(due.getDate() + step.dayOffset);
    return {
      lead_id: leadId,
      playbook: pb.id,
      sequence_order: i + 1,
      task_type: step.taskType,
      title: step.title,
      description: step.description,
      due_date: due.toISOString().split("T")[0],
      status: "pending",
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const dryRun = body.dryRun === true;

  // 1. Pull all active (non-closed, non-archived) leads + their stage anchor.
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, stage, stage_entered_date")
    .is("archived_at", null);
  if (leadsErr) {
    return new Response(JSON.stringify({ error: leadsErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Pull existing playbook task pairs to dedupe.
  const { data: existingTasks } = await supabase
    .from("lead_tasks")
    .select("lead_id, playbook")
    .limit(20000);
  const existing = new Set<string>();
  for (const t of existingTasks || []) existing.add(`${t.lead_id}::${t.playbook}`);

  const newTasks: ReturnType<typeof tasksFor> = [];
  const summary: Record<string, number> = {};
  let skipped = 0;

  for (const lead of leads || []) {
    const v2Stage = normalizeStage(lead.stage);
    const pb = PLAYBOOKS[v2Stage];
    if (!pb) continue;
    const key = `${lead.id}::${pb.id}`;
    if (existing.has(key)) { skipped++; continue; }
    const anchor = lead.stage_entered_date ? new Date(lead.stage_entered_date) : new Date();
    const tasks = tasksFor(v2Stage, lead.id, anchor);
    newTasks.push(...tasks);
    summary[v2Stage] = (summary[v2Stage] || 0) + 1;
  }

  if (dryRun) {
    return new Response(JSON.stringify({
      dryRun: true, wouldCreate: newTasks.length, leadsAffected: Object.values(summary).reduce((a, b) => a + b, 0),
      skipped, byStage: summary,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Insert in chunks of 500.
  let inserted = 0;
  for (let i = 0; i < newTasks.length; i += 500) {
    const chunk = newTasks.slice(i, i + 500);
    const { error } = await supabase.from("lead_tasks").insert(chunk);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, insertedSoFar: inserted }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += chunk.length;
  }

  return new Response(JSON.stringify({
    inserted, leadsAffected: Object.values(summary).reduce((a, b) => a + b, 0),
    skipped, byStage: summary,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
