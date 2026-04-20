// Automated follow-up task playbook definitions — Pipeline v2.
//
// Each playbook is keyed to a v2 stage name. `getPlaybookForStage` normalizes
// the incoming stage so legacy stage values ("Meeting Set", "Meeting Held",
// "Contacted", etc.) still resolve to the correct v2 playbook.
//
// New in v2:
//   - "sample-sent" playbook (the make-or-break stage)
//   - "nurture-90day" playbook (replaces the R/R graveyard)
//   - "negotiating" merges old "negotiation" + "contract-sent"

import { LeadStage } from "@/types/lead";
import { normalizeStage } from "@/lib/leadUtils";

export interface PlaybookStep {
  dayOffset: number;        // Relative to trigger date (negative = before meeting)
  taskType: "email" | "call" | "prep" | "internal";
  title: string;
  description: string;
  actionType?: string;      // Maps to generate-follow-up-action actionType for AI drafts
}

export interface Playbook {
  id: string;
  label: string;
  /** v2 canonical stage name this playbook fires on. */
  triggerStage: LeadStage;
  steps: PlaybookStep[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: "unassigned",
    label: "Unassigned — First Touch",
    triggerStage: "Unassigned",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Send initial outreach", description: "Personalized first-touch email referencing their submission and a clear next step.", actionType: "initial-outreach" },
      { dayOffset: 3, taskType: "email", title: "Different angle follow-up", description: "Try a different value angle if no response.", actionType: "initial-outreach" },
      { dayOffset: 7, taskType: "internal", title: "LinkedIn touchpoint", description: "Connect on LinkedIn with a personalized note." },
    ],
  },
  {
    id: "in-contact",
    label: "In Contact — Move to Discovery",
    triggerStage: "In Contact",
    steps: [
      { dayOffset: 1, taskType: "email", title: "Confirm interest, propose discovery call", description: "Confirm fit, share 2-3 time slots, set agenda expectation.", actionType: "meeting-nudge" },
      { dayOffset: 5, taskType: "email", title: "Re-nudge if no booking", description: "Tighter ask with concrete value statement.", actionType: "meeting-nudge" },
      { dayOffset: 10, taskType: "internal", title: "Decide: keep or close-lost", description: "If no movement after 10 days, close lost or move to nurture." },
    ],
  },
  {
    id: "discovery-scheduled",
    label: "Discovery Scheduled — Pre-Call",
    triggerStage: "Discovery Scheduled",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Send confirmation + agenda preview", description: "Confirm meeting, share 2-3 talking points tailored to their needs.", actionType: "prep-brief" },
      { dayOffset: -1, taskType: "prep", title: "Auto-generate prep brief", description: "Generate full pre-meeting intelligence brief: company dossier + prospect profile + battle card.", actionType: "prep-brief" },
      { dayOffset: 1, taskType: "email", title: "Post-meeting recap", description: "Send recap of key takeaways, agreed next steps, and timeline.", actionType: "post-meeting" },
    ],
  },
  {
    id: "discovery-completed",
    label: "Discovery Completed → Sample",
    triggerStage: "Discovery Completed",
    steps: [
      { dayOffset: 1, taskType: "email", title: "Send recap + sample plan", description: "Summarize discovery, propose what the sample will demonstrate, set a delivery date.", actionType: "post-meeting" },
      { dayOffset: 3, taskType: "internal", title: "Build & send sample", description: "Produce sample (targets list / call script / proof) and send before momentum decays.", actionType: "post-meeting" },
      { dayOffset: 7, taskType: "email", title: "Check-in if no sample sent yet", description: "If sample hasn't shipped, escalate internally and notify prospect of status.", actionType: "post-meeting" },
    ],
  },
  {
    id: "sample-sent",
    label: "Sample Sent — Outcome Capture",
    triggerStage: "Sample Sent",
    steps: [
      { dayOffset: 2, taskType: "email", title: "Day-2 check-in: any reactions?", description: "Light-touch check-in — ask if the sample landed, soliciting initial reactions.", actionType: "proposal-followup" },
      { dayOffset: 5, taskType: "email", title: "Day-5: log sample outcome", description: "Direct ask — was the sample useful? What did they think? Capture sampleOutcome on the record.", actionType: "proposal-followup" },
      { dayOffset: 10, taskType: "call", title: "Day-10 nudge call", description: "If still no response, jump on a quick call to unblock and confirm next step.", actionType: "proposal-followup" },
      { dayOffset: 14, taskType: "internal", title: "Decide: proposal or nurture", description: "If sample feedback positive → move to Proposal Sent. If silent → nurture or close lost." },
    ],
  },
  {
    id: "proposal-sent",
    label: "Proposal Sent",
    triggerStage: "Proposal Sent",
    steps: [
      { dayOffset: 2, taskType: "email", title: "\"Any questions?\" check-in", description: "Brief, low-pressure follow-up asking if they need any clarification.", actionType: "proposal-followup" },
      { dayOffset: 5, taskType: "email", title: "Value-add follow-up", description: "Share a relevant case study or ROI proof that reinforces the proposal.", actionType: "proposal-followup" },
      { dayOffset: 10, taskType: "email", title: "Direct ask + negotiation nudge", description: "Ask about timeline and decision process; surface any blockers.", actionType: "proposal-followup" },
      { dayOffset: 14, taskType: "internal", title: "Require stall reason if no movement", description: "If proposal still open after 14 days, document why and decide next move." },
    ],
  },
  {
    id: "negotiating",
    label: "Negotiating — Close",
    triggerStage: "Negotiating",
    steps: [
      { dayOffset: 1, taskType: "email", title: "Send contract / terms doc", description: "Push the paper. Confirm contract structure, payment terms, start date.", actionType: "proposal-followup" },
      { dayOffset: 3, taskType: "email", title: "Follow up on signature", description: "Polite nudge — any blockers on signing? Anything to clarify?", actionType: "proposal-followup" },
      { dayOffset: 7, taskType: "call", title: "Direct close call", description: "Get on the phone — close the deal or surface the real blocker." },
    ],
  },
  {
    id: "nurture-90day",
    label: "90-Day Nurture (Closed Lost)",
    triggerStage: "Closed Lost",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Day-0 insight email", description: "Send a high-value market insight relevant to their stated thesis. No ask.", actionType: "re-engagement" },
      { dayOffset: 30, taskType: "email", title: "Day-30 market update", description: "Share a curated market update or relevant deal signal. Still no ask.", actionType: "re-engagement" },
      { dayOffset: 45, taskType: "call", title: "Day-45 reconnect call", description: "Phone outreach — soft reconnect, ask how their priorities have shifted." },
      { dayOffset: 90, taskType: "email", title: "Day-90 explicit re-open ask", description: "Direct ask — is now a better time? If yes, move to In Contact and re-open the deal.", actionType: "re-engagement" },
    ],
  },
];

/**
 * Lookup a playbook by stage. Normalizes legacy stage names so old data still
 * triggers the correct v2 playbook (e.g. "Meeting Set" → "Discovery Scheduled").
 */
export function getPlaybookForStage(stage: string): Playbook | undefined {
  const normalized = normalizeStage(stage);
  return PLAYBOOKS.find(p => p.triggerStage === normalized);
}

export function generateTasksFromPlaybook(
  playbook: Playbook,
  leadId: string,
  anchorDate: Date = new Date()
): Array<{
  lead_id: string;
  playbook: string;
  sequence_order: number;
  task_type: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
}> {
  return playbook.steps.map((step, index) => {
    const dueDate = new Date(anchorDate);
    dueDate.setDate(dueDate.getDate() + step.dayOffset);
    return {
      lead_id: leadId,
      playbook: playbook.id,
      sequence_order: index + 1,
      task_type: step.taskType,
      title: step.title,
      description: step.description,
      due_date: dueDate.toISOString().split("T")[0],
      status: "pending",
    };
  });
}
