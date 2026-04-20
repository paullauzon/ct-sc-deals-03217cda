import { Lead, DealIntelligence } from "@/types/lead";
import { computeDaysInStage, normalizeStage } from "@/lib/leadUtils";

// ─── Mark Action Item Done ───

export function markActionItemDone(lead: Lead, itemIndex: number): Partial<Lead> {
  const di = lead.dealIntelligence;
  if (!di || !di.actionItemTracker) return {};
  const tracker = [...di.actionItemTracker];
  if (itemIndex < 0 || itemIndex >= tracker.length) return {};
  tracker[itemIndex] = { ...tracker[itemIndex], status: "Completed" };
  return {
    dealIntelligence: { ...di, actionItemTracker: tracker } as any,
  };
}

// ─── Deal Health Score (0-100) ───

export interface DealHealthResult {
  score: number;
  color: "emerald" | "amber" | "red";
  label: string;
  factors: { label: string; impact: number }[];
}

export function computeDealHealthScore(lead: Lead): DealHealthResult | null {
  const di = lead.dealIntelligence;
  if (!di) return null;

  let score = 50; // baseline
  const factors: { label: string; impact: number }[] = [];

  // Champion presence
  const stakeholders = di.stakeholderMap || [];
  const hasChampion = stakeholders.some(s => s.stance === "Champion");
  if (hasChampion) {
    score += 20;
    factors.push({ label: "Champion identified", impact: 20 });
  } else if (stakeholders.length > 0) {
    score -= 15;
    factors.push({ label: "No champion", impact: -15 });
  }

  // Action item completion
  const actions = di.actionItemTracker || [];
  if (actions.length > 0) {
    const completed = actions.filter(a => a.status === "Completed").length;
    const rate = completed / actions.length;
    const impact = Math.round((rate - 0.5) * 30);
    score += impact;
    factors.push({ label: `${Math.round(rate * 100)}% actions done`, impact });
  }

  // Momentum
  const momentum = di.momentumSignals?.momentum;
  if (momentum === "Accelerating") { score += 15; factors.push({ label: "Accelerating", impact: 15 }); }
  else if (momentum === "Stalling") { score -= 15; factors.push({ label: "Stalling", impact: -15 }); }
  else if (momentum === "Stalled") { score -= 20; factors.push({ label: "Stalled", impact: -20 }); }

  // Days in stage
  const days = computeDaysInStage(lead.stageEnteredDate);
  if (days > 21) { score -= 10; factors.push({ label: `${days}d in stage`, impact: -10 }); }
  else if (days > 14) { score -= 5; factors.push({ label: `${days}d in stage`, impact: -5 }); }

  // Unmitigated critical risks
  const criticalRisks = (di.riskRegister || []).filter(r => r.severity === "Critical" && r.mitigationStatus === "Unmitigated");
  if (criticalRisks.length > 0) {
    const impact = -10 * criticalRisks.length;
    score += impact;
    factors.push({ label: `${criticalRisks.length} critical risk${criticalRisks.length > 1 ? "s" : ""}`, impact });
  }

  score = Math.max(0, Math.min(100, score));
  const color = score >= 65 ? "emerald" : score >= 40 ? "amber" : "red";
  const label = score >= 65 ? "Healthy" : score >= 40 ? "At Risk" : "Critical";

  return { score, color, label, factors };
}

// ─── Win/Lose Card ───

export interface WinLoseCard {
  win: string;
  lose: string;
  doNext: string;
}

export function getWinLoseCard(lead: Lead): WinLoseCard | null {
  const di = lead.dealIntelligence;
  if (!di) return null;

  // Win reason
  let win = "";
  if (di.winStrategy?.numberOneCloser) {
    win = di.winStrategy.numberOneCloser;
  } else {
    const hasChampion = (di.stakeholderMap || []).some(s => s.stance === "Champion");
    const momentum = di.momentumSignals?.momentum;
    if (hasChampion && momentum === "Accelerating") win = "Champion + accelerating momentum";
    else if (hasChampion) win = "Internal champion identified";
    else if (momentum === "Accelerating") win = "Strong momentum";
  }

  // Lose reason
  let lose = "";
  const unmitigated = (di.riskRegister || []).filter(r => r.mitigationStatus !== "Mitigated");
  const openObj = (di.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring");
  const hasChampion = (di.stakeholderMap || []).some(s => s.stance === "Champion");

  if (unmitigated.length > 0) lose = unmitigated[0].risk;
  else if (openObj.length > 0) lose = `Open objection: ${openObj[0].objection}`;
  else if (!hasChampion && (di.stakeholderMap || []).length > 0) lose = "No internal champion identified";

  // Do next
  let doNext = "";
  const openActions = (di.actionItemTracker || []).filter(a => a.status === "Open" || a.status === "Overdue");
  if (openActions.length > 0) {
    doNext = openActions[0].item;
  } else if (di.winStrategy?.powerMove) {
    doNext = di.winStrategy.powerMove;
  }

  if (!win && !lose && !doNext) return null;
  return { win: win || "—", lose: lose || "No major risks detected", doNext: doNext || "—" };
}

// ─── Stakeholder Coverage ───

export type StakeholderCoverage = "multi-threaded" | "single-threaded" | "no-champion";

export function getStakeholderCoverage(lead: Lead): { coverage: StakeholderCoverage; label: string; colorClass: string; count: number } | null {
  const stakeholders = lead.dealIntelligence?.stakeholderMap;
  if (!stakeholders || stakeholders.length === 0) return null;

  const count = stakeholders.length;
  const hasChampion = stakeholders.some(s => s.stance === "Champion");
  if (!hasChampion) return { coverage: "no-champion", label: "No advocate", colorClass: "text-muted-foreground bg-secondary", count };
  if (count === 1) return { coverage: "single-threaded", label: `${count} contact`, colorClass: "text-muted-foreground bg-secondary", count };
  return { coverage: "multi-threaded", label: `${count} stakeholders`, colorClass: "text-muted-foreground bg-secondary", count };
}

// ─── Dropped Promises ───

export interface DroppedPromise {
  item: string;
  owner: string;
  daysOverdue: number;
}

export function getDroppedPromises(lead: Lead): DroppedPromise[] {
  const actions = lead.dealIntelligence?.actionItemTracker;
  if (!actions) return [];

  const now = new Date();
  const leadNameLower = lead.name?.toLowerCase() || "";
  return actions
    .filter(a => (a.status === "Open" || a.status === "Overdue") && a.owner?.toLowerCase() !== leadNameLower)
    .map(a => {
      let daysOverdue = 0;
      if (a.deadline) {
        try {
          const deadline = new Date(a.deadline);
          daysOverdue = Math.max(0, Math.floor((now.getTime() - deadline.getTime()) / 86400000));
        } catch {}
      }
      return { item: a.item, owner: a.owner, daysOverdue };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// ─── Similar Deals Won ───

export interface SimilarDealMatch {
  name: string;
  company: string;
  dealValue: number;
  winTactic: string;
  brand: string;
}

export function findSimilarWonDeals(lead: Lead, allLeads: Lead[]): SimilarDealMatch[] {
  const wonDeals = allLeads.filter(l =>
    l.stage === "Closed Won" &&
    l.id !== lead.id &&
    l.brand === lead.brand
  );

  return wonDeals
    .filter(w => {
      const valueSimilar = lead.dealValue === 0 || w.dealValue === 0 || Math.abs(w.dealValue - lead.dealValue) / Math.max(w.dealValue, lead.dealValue) <= 0.5;
      const serviceSimilar = !lead.serviceInterest || lead.serviceInterest === "TBD" || w.serviceInterest === lead.serviceInterest;
      return valueSimilar || serviceSimilar;
    })
    .map(w => ({
      name: w.name,
      company: w.company,
      dealValue: w.subscriptionValue || w.dealValue,
      winTactic: w.dealIntelligence?.winStrategy?.numberOneCloser || w.wonReason || "—",
      brand: w.brand,
    }));
}

// ─── Pricing Guidance ───

export interface PricingGuidance {
  prospectBudget: string | null;
  wonRange: { min: number; max: number; avg: number } | null;
  wonCount: number;
}

export function getPricingGuidance(lead: Lead, allLeads: Lead[]): PricingGuidance {
  // Prospect's stated budget
  let prospectBudget: string | null = null;
  for (const m of (lead.meetings || []).slice().reverse()) {
    const budget = m.intelligence?.dealSignals?.budgetMentioned;
    if (budget && budget !== "Not mentioned" && budget !== "None mentioned" && budget.length > 0) {
      prospectBudget = budget;
      break;
    }
  }

  // Won deal pricing corridor for this brand
  const wonDeals = allLeads.filter(l => l.stage === "Closed Won" && l.brand === lead.brand && l.subscriptionValue > 0);
  let wonRange: PricingGuidance["wonRange"] = null;
  if (wonDeals.length > 0) {
    const values = wonDeals.map(l => l.subscriptionValue);
    wonRange = {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    };
  }

  return { prospectBudget, wonRange, wonCount: wonDeals.length };
}

// ─── Objection Playbook ───

export interface ObjectionPlaybookEntry {
  objection: string;
  wonDealApproach: string;
  wonDealName: string;
}

export function getObjectionPlaybook(lead: Lead, allLeads: Lead[]): ObjectionPlaybookEntry[] {
  const openObjections = (lead.dealIntelligence?.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring");
  if (openObjections.length === 0) return [];

  const wonDeals = allLeads.filter(l => l.stage === "Closed Won" && l.dealIntelligence);
  const playbook: ObjectionPlaybookEntry[] = [];

  for (const obj of openObjections) {
    const objLower = obj.objection.toLowerCase();
    for (const won of wonDeals) {
      const wonObjs = won.dealIntelligence!.objectionTracker || [];
      const match = wonObjs.find(wo =>
        wo.status === "Addressed" &&
        (wo.objection.toLowerCase().includes(objLower.split(" ")[0]) || objLower.includes(wo.objection.toLowerCase().split(" ")[0]))
      );
      if (match) {
        playbook.push({
          objection: obj.objection,
          wonDealApproach: match.resolution || "Addressed through discussion",
          wonDealName: won.name,
        });
        break;
      }
    }
  }

  return playbook;
}

// ─── Active stages for "going dark" detection ───
// v2 stages — using normalizeStage() in callers so legacy values still match.
const ACTIVE_STAGES = new Set(["Discovery Completed", "Sample Sent", "Proposal Sent", "Negotiating"]);
const POST_MEETING_STAGES = new Set(["Discovery Completed", "Sample Sent", "Proposal Sent", "Negotiating"]);

// ─── Unified Action Count ───

export interface UnifiedActionCount {
  total: number;
  breakdown: {
    unansweredEmail: boolean;
    dropped: number;
    meetingPrep: boolean;
    objections: number;
    playbook: number;
    theyOwe: number;
    goingDark: boolean;
    noChampion: boolean;
    overdueFollowUp: boolean;
    staleNewLead: boolean;
    contractRenewal: boolean;
    logMeetingOutcome: boolean;
    sentimentDeclining: boolean;
    highIntent: boolean;
    nextBest: boolean;
  };
  /** Single-item display text when total === 1 */
  singleActionText: string | null;
  /** Tooltip lines for breakdown, priority-ordered */
  tooltipLines: string[];
}

export function getUnifiedActionCount(
  lead: Lead,
  playbookTaskCount: number = 0,
  options: {
    hasUnansweredEmail?: boolean;
    hasMeetingPrep?: boolean;
  } = {}
): UnifiedActionCount {
  const di = lead.dealIntelligence;
  const now = new Date();
  const tooltipLines: string[] = [];

  // 1. Unanswered inbound email
  const unansweredEmail = options.hasUnansweredEmail ?? false;
  if (unansweredEmail) tooltipLines.push(`Reply to ${lead.name}'s email`);

  // 2. Dropped promises
  const dropped = getDroppedPromises(lead);
  const droppedCount = dropped.length;
  if (droppedCount > 0) {
    if (droppedCount === 1) tooltipLines.push(`Complete: "${dropped[0].item}"`);
    else tooltipLines.push(`${droppedCount} overdue commitment${droppedCount > 1 ? "s" : ""}`);
  }

  // 3. Meeting prep needed
  const meetingPrep = options.hasMeetingPrep ?? false;
  if (meetingPrep) {
    const meetingDate = lead.meetingDate;
    if (meetingDate) {
      try {
        const d = new Date(meetingDate);
        tooltipLines.push(`Prep for meeting ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
      } catch {
        tooltipLines.push("Prep for upcoming meeting");
      }
    } else {
      tooltipLines.push("Prep for upcoming meeting");
    }
  }

  // 4. Open objections
  const openObjections = (di?.objectionTracker || []).filter(
    (o: any) => o.status === "Open" || o.status === "Recurring"
  );
  const objectionsCount = openObjections.length;
  if (objectionsCount > 0) {
    if (objectionsCount === 1) tooltipLines.push(`Address: "${openObjections[0].objection}"`);
    else tooltipLines.push(`${objectionsCount} open objection${objectionsCount > 1 ? "s" : ""}`);
  }

  // 5. Playbook tasks
  if (playbookTaskCount > 0) {
    tooltipLines.push(`${playbookTaskCount} playbook task${playbookTaskCount > 1 ? "s" : ""} due`);
  }

  // 6. They owe us something
  const theyOwe = (di?.actionItemTracker || []).filter(
    (a: any) => (a.status === "Open" || a.status === "Overdue") &&
      a.owner?.toLowerCase() === lead.name?.toLowerCase()
  );
  const theyOweCount = theyOwe.length;
  if (theyOweCount > 0) {
    if (theyOweCount === 1) tooltipLines.push(`Nudge ${lead.name}: "${theyOwe[0].item}"`);
    else tooltipLines.push(`${theyOweCount} items ${lead.name} owes`);
  }

  // 7. Going dark
  let goingDark = false;
  if (ACTIVE_STAGES.has(normalizeStage(lead.stage)) && lead.lastContactDate) {
    try {
      const daysSilent = Math.floor((now.getTime() - new Date(lead.lastContactDate).getTime()) / 86400000);
      if (daysSilent >= 7) {
        goingDark = true;
        tooltipLines.push(`Re-engage — ${daysSilent}d silent`);
      }
    } catch {}
  }

  // 8. No champion past Discovery Completed
  let noChampion = false;
  const stakeholders = di?.stakeholderMap || [];
  if (POST_MEETING_STAGES.has(normalizeStage(lead.stage)) && stakeholders.length > 0) {
    const hasChampion = stakeholders.some((s: any) => s.stance === "Champion");
    if (!hasChampion) {
      noChampion = true;
      tooltipLines.push("Find a champion");
    }
  }

  // 9. Overdue follow-up
  let overdueFollowUp = false;
  if (lead.nextFollowUp) {
    try { overdueFollowUp = new Date(lead.nextFollowUp) < now; } catch {}
  }
  if (overdueFollowUp) tooltipLines.push("Follow-up overdue");

  // 10. Stale new lead — first-touch never made on Unassigned/In Contact
  let staleNewLead = false;
  const normStage = normalizeStage(lead.stage);
  if ((normStage === "Unassigned" || normStage === "In Contact") && !lead.lastContactDate) {
    const submitted = lead.dateSubmitted || lead.stageEnteredDate;
    if (submitted) {
      try {
        const daysOld = Math.floor((now.getTime() - new Date(submitted).getTime()) / 86400000);
        if (daysOld >= 2) {
          staleNewLead = true;
          tooltipLines.push("Make first contact");
        }
      } catch {}
    }
  }

  // 11. Contract renewal approaching (Closed Won)
  let contractRenewal = false;
  if (lead.stage === "Closed Won" && lead.contractEnd) {
    try {
      const daysToRenewal = Math.floor((new Date(lead.contractEnd).getTime() - now.getTime()) / 86400000);
      if (daysToRenewal >= 0 && daysToRenewal <= 60) {
        contractRenewal = true;
        tooltipLines.push(`Renewal in ${daysToRenewal}d — start conversation`);
      }
    } catch {}
  }

  // 12. Log meeting outcome (data hygiene) — Discovery Completed without an outcome
  let logMeetingOutcome = false;
  if (normalizeStage(lead.stage) === "Discovery Completed" && !lead.meetingOutcome) {
    logMeetingOutcome = true;
    tooltipLines.push("Log meeting outcome");
  }

  // 13. Declining sentiment trajectory
  let sentimentDeclining = false;
  const sentTrajectory = di?.momentumSignals?.sentimentTrajectory;
  if (Array.isArray(sentTrajectory) && sentTrajectory.length >= 2) {
    const sentimentRank: Record<string, number> = { "Very Positive": 5, "Positive": 4, "Neutral": 3, "Cautious": 2, "Negative": 1 };
    const first = sentimentRank[sentTrajectory[0]] ?? 3;
    const last = sentimentRank[sentTrajectory[sentTrajectory.length - 1]] ?? 3;
    if (last < first) {
      sentimentDeclining = true;
      tooltipLines.push(`Sentiment declining — was ${sentTrajectory[0]}, now ${sentTrajectory[sentTrajectory.length - 1]}`);
    }
  }

  // 14. High intent — multi-submission (Unassigned/In Contact only)
  let highIntent = false;
  const submissions = (lead as any).submissions;
  const normStage2 = normalizeStage(lead.stage);
  if (Array.isArray(submissions) && submissions.length > 1 && (normStage2 === "Unassigned" || normStage2 === "In Contact")) {
    highIntent = true;
    tooltipLines.push(`High intent — submitted ${submissions.length} times, prioritize outreach`);
  }

  // 15. Next Best Action (catch-all, but don't duplicate dropped/theyOwe)
  let hasNextBest = false;
  if (droppedCount === 0 && theyOweCount === 0) {
    const nba = getNextBestAction(lead);
    if (nba) {
      hasNextBest = true;
      tooltipLines.push(nba.action);
    }
  }

  const total =
    (unansweredEmail ? 1 : 0) +
    droppedCount +
    (meetingPrep ? 1 : 0) +
    objectionsCount +
    playbookTaskCount +
    theyOweCount +
    (goingDark ? 1 : 0) +
    (noChampion ? 1 : 0) +
    (overdueFollowUp ? 1 : 0) +
    (staleNewLead ? 1 : 0) +
    (contractRenewal ? 1 : 0) +
    (logMeetingOutcome ? 1 : 0) +
    (sentimentDeclining ? 1 : 0) +
    (highIntent ? 1 : 0) +
    (hasNextBest ? 1 : 0);

  // Single action text — show the first tooltip line as the card text
  let singleActionText: string | null = null;
  if (total === 1 && tooltipLines.length > 0) {
    singleActionText = tooltipLines[0];
  }

  return {
    total,
    breakdown: {
      unansweredEmail,
      dropped: droppedCount,
      meetingPrep,
      objections: objectionsCount,
      playbook: playbookTaskCount,
      theyOwe: theyOweCount,
      goingDark,
      noChampion,
      overdueFollowUp,
      staleNewLead,
      contractRenewal,
      logMeetingOutcome,
      sentimentDeclining,
      highIntent,
      nextBest: hasNextBest,
    },
    singleActionText,
    tooltipLines,
  };
}

// ─── Next Best Action Engine ───

export interface NextBestAction {
  action: string;
  reason: string;
  urgency: "critical" | "high" | "medium" | "low";
}

export function getNextBestAction(lead: Lead): NextBestAction | null {
  const di = lead.dealIntelligence;
  const now = new Date();

  // Check dropped promises first (highest ROI)
  const dropped = getDroppedPromises(lead);
  if (dropped.length > 0 && dropped[0].daysOverdue > 3) {
    return {
      action: `Complete: "${dropped[0].item}"`,
      reason: `${dropped[0].daysOverdue}d overdue — promises drive trust`,
      urgency: dropped[0].daysOverdue > 14 ? "critical" : "high",
    };
  }

  // Momentum stalling + no recent contact
  const momentum = di?.momentumSignals?.momentum;
  const lastContact = lead.lastContactDate ? new Date(lead.lastContactDate) : null;
  const daysSinceContact = lastContact ? Math.floor((now.getTime() - lastContact.getTime()) / 86400000) : null;

  if ((momentum === "Stalling" || momentum === "Stalled") && daysSinceContact && daysSinceContact > 5) {
    return {
      action: "Re-engage with case study or value-add",
      reason: `Momentum ${momentum.toLowerCase()}, ${daysSinceContact}d since contact`,
      urgency: "critical",
    };
  }

  // Proposal sent with no response (v2 + legacy via normalize)
  if (normalizeStage(lead.stage) === "Proposal Sent" && daysSinceContact && daysSinceContact > 5) {
    return {
      action: "Direct ask about timeline and decision",
      reason: `Proposal sent ${daysSinceContact}d ago — no response`,
      urgency: "high",
    };
  }

  // Latest sentiment was neutral
  const latestMeeting = lead.meetings?.slice().reverse().find(m => m.intelligence);
  const sentiment = latestMeeting?.intelligence?.dealSignals?.sentiment;
  if (sentiment === "Neutral" || sentiment === "Cautious") {
    return {
      action: "Send targeted value-add to shift sentiment",
      reason: `Last meeting sentiment: ${sentiment}`,
      urgency: "high",
    };
  }

  // They owe us something
  const theyOwe = (di?.actionItemTracker || []).filter(a =>
    (a.status === "Open" || a.status === "Overdue") &&
    a.owner?.toLowerCase() === lead.name?.toLowerCase()
  );
  if (theyOwe.length > 0) {
    return {
      action: `Nudge on: "${theyOwe[0].item}"`,
      reason: "They committed to this — follow up",
      urgency: "medium",
    };
  }

  // Default: nudge to advance from Discovery Completed → Sample Sent
  if (normalizeStage(lead.stage) === "Discovery Completed" && lead.dealValue > 0) {
    return { action: "Send sample to keep momentum", reason: "Discovery done, sample is the next gate", urgency: "medium" };
  }

  return null;
}
