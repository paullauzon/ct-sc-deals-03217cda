import { Lead, LeadStage } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";

// ─── Win Probability ───
//
// A bounded 0–100 score combining stage prior, momentum, champion strength,
// objection load, sentiment trajectory, days in stage, action completion,
// and the user-entered closeConfidence. Designed to be auditable, not a
// black box — every contribution is exposed via `factors`.

const STAGE_PRIOR: Record<LeadStage, number> = {
  "New Lead": 5,
  "Qualified": 12,
  "Contacted": 18,
  "Meeting Set": 28,
  "Meeting Held": 40,
  "Proposal Sent": 55,
  "Negotiation": 68,
  "Contract Sent": 80,
  "Revisit/Reconnect": 8,
  "Lost": 0,
  "Went Dark": 5,
  "Closed Won": 100,
};

export interface WinProbabilityResult {
  probability: number; // 0-100
  band: "very-low" | "low" | "medium" | "high" | "very-high";
  label: string;
  factors: { label: string; impact: number }[];
}

export function computeWinProbability(lead: Lead): WinProbabilityResult | null {
  if (lead.stage === "Closed Won") return { probability: 100, band: "very-high", label: "Won", factors: [] };
  if (lead.stage === "Lost") return { probability: 0, band: "very-low", label: "Lost", factors: [] };

  const factors: { label: string; impact: number }[] = [];
  let p = STAGE_PRIOR[lead.stage] ?? 10;
  factors.push({ label: `${lead.stage} baseline`, impact: p });

  const di = lead.dealIntelligence;

  // Champion presence
  const stakeholders = di?.stakeholderMap || [];
  if (stakeholders.length > 0) {
    const champ = stakeholders.find(s => s.stance === "Champion");
    const blocker = stakeholders.some(s => s.stance === "Blocker");
    if (champ) { p += 12; factors.push({ label: "Champion present", impact: 12 }); }
    else if (stakeholders.length >= 2) { p -= 6; factors.push({ label: "Multi-stakeholder, no champion", impact: -6 }); }
    if (blocker) { p -= 10; factors.push({ label: "Blocker identified", impact: -10 }); }
  }

  // Momentum
  const momentum = di?.momentumSignals?.momentum;
  if (momentum === "Accelerating") { p += 10; factors.push({ label: "Accelerating", impact: 10 }); }
  else if (momentum === "Stalling") { p -= 8; factors.push({ label: "Stalling", impact: -8 }); }
  else if (momentum === "Stalled") { p -= 14; factors.push({ label: "Stalled", impact: -14 }); }

  // Open objections
  const openObj = (di?.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring");
  if (openObj.length > 0) {
    const impact = -Math.min(15, openObj.length * 5);
    p += impact;
    factors.push({ label: `${openObj.length} open objection${openObj.length > 1 ? "s" : ""}`, impact });
  }

  // Critical risks
  const critRisk = (di?.riskRegister || []).filter(r => r.severity === "Critical" && r.mitigationStatus === "Unmitigated").length;
  if (critRisk > 0) {
    const impact = -Math.min(15, critRisk * 7);
    p += impact;
    factors.push({ label: `${critRisk} critical risk${critRisk > 1 ? "s" : ""}`, impact });
  }

  // Sentiment trajectory (last vs first)
  const traj = di?.momentumSignals?.sentimentTrajectory;
  if (Array.isArray(traj) && traj.length >= 2) {
    const rank: Record<string, number> = { "Very Positive": 5, "Positive": 4, "Neutral": 3, "Cautious": 2, "Negative": 1 };
    const first = rank[traj[0]] ?? 3;
    const last = rank[traj[traj.length - 1]] ?? 3;
    const delta = last - first;
    if (delta >= 1) { p += 6; factors.push({ label: "Sentiment improving", impact: 6 }); }
    else if (delta <= -1) { p -= 8; factors.push({ label: "Sentiment declining", impact: -8 }); }
  }

  // Latest meeting intent
  const latestIntel = (lead.meetings || [])
    .filter(m => m.intelligence)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.intelligence;
  if (latestIntel?.dealSignals?.buyingIntent === "Strong") { p += 8; factors.push({ label: "Strong buying intent", impact: 8 }); }
  else if (latestIntel?.dealSignals?.buyingIntent === "Low") { p -= 6; factors.push({ label: "Low buying intent", impact: -6 }); }
  else if (latestIntel?.dealSignals?.buyingIntent === "None detected") { p -= 12; factors.push({ label: "No buying intent", impact: -12 }); }

  // Action completion
  const actions = di?.actionItemTracker || [];
  if (actions.length >= 2) {
    const completed = actions.filter(a => a.status === "Completed").length;
    const rate = completed / actions.length;
    const impact = Math.round((rate - 0.5) * 16);
    if (impact !== 0) { p += impact; factors.push({ label: `${Math.round(rate * 100)}% commitments delivered`, impact }); }
  }

  // Days in stage drag (only if we're in an active mid-stage)
  const days = computeDaysInStage(lead.stageEnteredDate);
  const activeMid = ["Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"].includes(lead.stage);
  if (activeMid && days > 21) { p -= 8; factors.push({ label: `${days}d in stage`, impact: -8 }); }
  else if (activeMid && days > 14) { p -= 4; factors.push({ label: `${days}d in stage`, impact: -4 }); }

  // Blend with rep's own confidence (light weight to avoid double-counting)
  if (typeof lead.closeConfidence === "number" && lead.closeConfidence > 0) {
    const blendImpact = Math.round((lead.closeConfidence - p) * 0.15);
    if (Math.abs(blendImpact) >= 1) {
      p += blendImpact;
      factors.push({ label: `Rep confidence ${lead.closeConfidence}%`, impact: blendImpact });
    }
  }

  const probability = Math.max(0, Math.min(100, Math.round(p)));
  const band: WinProbabilityResult["band"] =
    probability >= 75 ? "very-high" :
    probability >= 55 ? "high" :
    probability >= 35 ? "medium" :
    probability >= 18 ? "low" : "very-low";
  const label =
    band === "very-high" ? "Highly likely" :
    band === "high" ? "Likely" :
    band === "medium" ? "Possible" :
    band === "low" ? "Unlikely" : "Long shot";

  return { probability, band, label, factors };
}

// ─── Slip Risk ───
//
// Estimates how many days a deal is likely to slip past its forecasted close
// or expected stage exit. Combines momentum, days-in-stage, dropped commitments,
// and silence to produce a single "expected slippage" number plus a risk band.

export interface SlipRiskResult {
  /** Estimated days the deal will slip past its forecasted close. 0 = on track. */
  slipDays: number;
  band: "on-track" | "watch" | "at-risk" | "critical";
  label: string;
  reasons: string[];
}

const ACTIVE_OPEN_STAGES = new Set<LeadStage>([
  "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent",
]);

export function computeSlipRisk(lead: Lead): SlipRiskResult | null {
  if (!ACTIVE_OPEN_STAGES.has(lead.stage)) return null;
  const di = lead.dealIntelligence;
  const reasons: string[] = [];
  let slip = 0;

  const days = computeDaysInStage(lead.stageEnteredDate);
  if (days > 30) { slip += 14; reasons.push(`${days}d in ${lead.stage}`); }
  else if (days > 21) { slip += 9; reasons.push(`${days}d in ${lead.stage}`); }
  else if (days > 14) { slip += 5; reasons.push(`${days}d in ${lead.stage}`); }

  const momentum = di?.momentumSignals?.momentum;
  if (momentum === "Stalled") { slip += 14; reasons.push("Momentum stalled"); }
  else if (momentum === "Stalling") { slip += 7; reasons.push("Momentum stalling"); }

  // Days since last contact
  if (lead.lastContactDate) {
    try {
      const silent = Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / 86400000);
      if (silent > 14) { slip += 10; reasons.push(`${silent}d silent`); }
      else if (silent > 7) { slip += 5; reasons.push(`${silent}d silent`); }
    } catch {}
  }

  // Dropped commitments on our side
  const ourOpen = (di?.actionItemTracker || []).filter(a => {
    const owner = (a.owner || "").toLowerCase();
    const isUs = owner === "malik" || owner === "valeria" || owner === "tomos" || owner.includes("us") || owner.includes("we");
    return isUs && (a.status === "Open" || a.status === "Overdue");
  });
  if (ourOpen.length > 0) {
    slip += Math.min(10, ourOpen.length * 4);
    reasons.push(`${ourOpen.length} commitment${ourOpen.length > 1 ? "s" : ""} pending`);
  }

  // Open objections drag late-stage deals
  const openObj = (di?.objectionTracker || []).filter(o => o.status === "Open" || o.status === "Recurring").length;
  if (openObj > 0 && (lead.stage === "Proposal Sent" || lead.stage === "Negotiation" || lead.stage === "Contract Sent")) {
    slip += Math.min(10, openObj * 4);
    reasons.push(`${openObj} unresolved objection${openObj > 1 ? "s" : ""}`);
  }

  // Forecasted-close already past
  if (lead.forecastedCloseDate) {
    try {
      const past = Math.floor((Date.now() - new Date(lead.forecastedCloseDate).getTime()) / 86400000);
      if (past > 0) { slip = Math.max(slip, past); reasons.push(`Forecast date passed ${past}d ago`); }
    } catch {}
  }

  const band: SlipRiskResult["band"] =
    slip >= 21 ? "critical" :
    slip >= 10 ? "at-risk" :
    slip >= 4 ? "watch" : "on-track";
  const label =
    band === "critical" ? `+${slip}d slip risk` :
    band === "at-risk" ? `+${slip}d slip risk` :
    band === "watch" ? `Watch · +${slip}d` : "On track";

  return { slipDays: slip, band, label, reasons };
}

// ─── Aggregate flag for pipeline-level "early warning" ───

export function isEarlyStallWarning(lead: Lead): boolean {
  const slip = computeSlipRisk(lead);
  if (!slip) return false;
  return slip.band === "at-risk" || slip.band === "critical";
}
