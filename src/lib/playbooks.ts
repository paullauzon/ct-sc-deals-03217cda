// Automated follow-up task playbook definitions
// Each playbook is triggered by a stage change and generates a sequence of tasks

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
  triggerStage: string;
  steps: PlaybookStep[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: "meeting-set",
    label: "Meeting Set",
    triggerStage: "Meeting Set",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Send confirmation email", description: "Confirm the meeting details, share agenda preview, and set expectations.", actionType: "initial-outreach" },
      { dayOffset: -1, taskType: "email", title: "Send agenda & talking points", description: "Share a concise agenda with 2-3 key discussion points tailored to their needs.", actionType: "prep-brief" },
      { dayOffset: 0, taskType: "prep", title: "Auto-generate prep brief", description: "Generate a full pre-meeting intelligence brief with company dossier and prospect profile.", actionType: "prep-brief" },
      { dayOffset: 1, taskType: "email", title: "Post-meeting follow-up with recap", description: "Send a recap of key takeaways, agreed next steps, and timeline.", actionType: "post-meeting" },
    ],
  },
  {
    id: "meeting-held",
    label: "Meeting Held → No Proposal",
    triggerStage: "Meeting Held",
    steps: [
      { dayOffset: 1, taskType: "email", title: "Send recap & next steps", description: "Summarize key discussion points, decisions made, and agreed action items.", actionType: "post-meeting" },
      { dayOffset: 3, taskType: "email", title: "Check-in if no response", description: "Gentle follow-up referencing specific value discussed in the meeting.", actionType: "post-meeting" },
      { dayOffset: 7, taskType: "email", title: "Re-engage with added value", description: "Share a relevant case study, article, or insight that ties to their stated priorities.", actionType: "post-meeting" },
    ],
  },
  {
    id: "proposal-sent",
    label: "Proposal Sent",
    triggerStage: "Proposal Sent",
    steps: [
      { dayOffset: 2, taskType: "email", title: "\"Any questions?\" check-in", description: "Brief, low-pressure follow-up asking if they need any clarification on the proposal.", actionType: "proposal-followup" },
      { dayOffset: 5, taskType: "email", title: "Value-add follow-up", description: "Share a relevant case study or ROI data that reinforces the proposal's value.", actionType: "proposal-followup" },
      { dayOffset: 10, taskType: "email", title: "Direct ask / negotiation nudge", description: "Directly ask about timeline and decision process; surface any blockers.", actionType: "proposal-followup" },
    ],
  },
  {
    id: "going-dark",
    label: "Going Dark",
    triggerStage: "Went Dark",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Re-engagement with market insight", description: "Share a timely industry insight or market trend relevant to their business.", actionType: "re-engagement" },
      { dayOffset: 7, taskType: "email", title: "Breakup email (last attempt)", description: "Final outreach — acknowledge their silence, leave the door open, create subtle urgency.", actionType: "re-engagement" },
      { dayOffset: 14, taskType: "internal", title: "Archive or reassign", description: "Review whether to archive this lead or reassign to a different approach." },
    ],
  },
  {
    id: "revisit-reconnect",
    label: "Revisit/Reconnect",
    triggerStage: "Revisit/Reconnect",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Re-engagement outreach", description: "Personalized outreach referencing previous conversations and any new developments.", actionType: "re-engagement" },
      { dayOffset: 7, taskType: "email", title: "Value-add touchpoint", description: "Share relevant industry insight, case study, or market update tied to their needs.", actionType: "re-engagement" },
      { dayOffset: 14, taskType: "call", title: "Direct reconnect call", description: "Phone outreach to re-establish the relationship and gauge current interest." },
      { dayOffset: 21, taskType: "internal", title: "Evaluate next steps", description: "Review response and decide whether to move to active pipeline or long-term follow up." },
    ],
  },
  {
    id: "long-term-follow-up",
    label: "Long Term Follow Up",
    triggerStage: "Long Term Follow Up",
    steps: [
      { dayOffset: 0, taskType: "email", title: "Quarterly check-in", description: "Low-pressure touchpoint to stay top-of-mind and surface any timing changes.", actionType: "re-engagement" },
      { dayOffset: 30, taskType: "email", title: "Industry update share", description: "Forward a relevant market report or insight that demonstrates ongoing value.", actionType: "re-engagement" },
      { dayOffset: 60, taskType: "email", title: "New capability announcement", description: "Share new service offerings or case studies that might reignite interest.", actionType: "re-engagement" },
      { dayOffset: 90, taskType: "internal", title: "Re-evaluate opportunity", description: "Assess whether to move back to active pipeline, continue nurturing, or archive." },
    ],
  },
  {
    id: "new-lead-no-response",
    label: "New Lead — No Response",
    triggerStage: "Contacted",
    steps: [
      { dayOffset: 3, taskType: "email", title: "Different angle follow-up", description: "Try a different value proposition or angle that may resonate better.", actionType: "initial-outreach" },
      { dayOffset: 7, taskType: "internal", title: "LinkedIn touchpoint", description: "Connect on LinkedIn with a personalized note referencing their business." },
      { dayOffset: 14, taskType: "email", title: "Final attempt with scarcity", description: "Last outreach with a time-sensitive offer or limited availability angle.", actionType: "meeting-nudge" },
    ],
  },
];

export function getPlaybookForStage(stage: string): Playbook | undefined {
  return PLAYBOOKS.find(p => p.triggerStage === stage);
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
