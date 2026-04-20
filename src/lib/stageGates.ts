import { Lead, LeadStage } from "@/types/lead";
import { normalizeStage, ACTIVE_STAGES, TERMINAL_STAGES } from "@/lib/leadUtils";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline v2 stage gates — the rules that govern when a deal can advance.
//
// Each gate enforces required fields on the deal record before the rep can
// move it forward. Reps can override (logged to lead.stage_gate_overrides
// for audit) but must explicitly choose to do so.
// ─────────────────────────────────────────────────────────────────────────────

export interface GateField {
  /** Lead property to check. */
  key: keyof Lead;
  /** Human label shown in the gate guard modal. */
  label: string;
  /** Optional one-line context (why this matters). */
  hint?: string;
  /** Field type — drives the inline editor in the modal. */
  type: "text" | "number" | "date" | "select" | "fireflies-url";
  /** Locked options for select fields. */
  options?: string[];
}

export interface StageGate {
  /** Stage we're moving INTO. */
  to: LeadStage;
  /** Headline shown in the modal. */
  title: string;
  /** Why this gate exists. */
  rationale: string;
  /** Fields the rep must fill (or override). */
  requiredFields: GateField[];
  /** Custom predicate — return null if all good, or a list of human messages. */
  customCheck?: (lead: Lead) => string[];
}

/**
 * Gate definitions keyed by destination stage. Lookup uses normalized stage
 * names so legacy "Meeting Held" → v2 "Discovery Completed" gate is hit.
 */
export const STAGE_GATES: Partial<Record<LeadStage, StageGate>> = {
  "Discovery Completed": {
    to: "Discovery Completed",
    title: "Discovery completed?",
    rationale: "We need a recording on file so the post-meeting AI can extract intelligence and feed Sample Sent.",
    requiredFields: [
      {
        key: "firefliesUrl",
        label: "Fireflies recording URL",
        hint: "Paste the Fireflies link or sync the meeting first",
        type: "fireflies-url",
      },
    ],
    customCheck: (lead) => {
      const hasFireflies = !!lead.firefliesUrl || (lead.meetings || []).some(m => !!m.firefliesUrl || !!m.firefliesId);
      return hasFireflies ? [] : ["No Fireflies recording linked"];
    },
  },

  "Sample Sent": {
    to: "Sample Sent",
    title: "Ready to send a sample?",
    rationale: "Sample Sent is the make-or-break stage. Lock down qualification BEFORE we burn time building a sample.",
    requiredFields: [
      { key: "serviceInterest", label: "Service interest", type: "select", options: ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other"], hint: "Which service are we sampling?" },
      { key: "geography", label: "Target geography", type: "text", hint: "e.g. US Midwest, EU, LATAM" },
      { key: "ebitdaMin", label: "EBITDA min", type: "text", hint: "e.g. $1M" },
      { key: "ebitdaMax", label: "EBITDA max", type: "text", hint: "e.g. $5M" },
      { key: "dealType", label: "Deal type", type: "select", options: ["Add-on", "Platform", "Both", "Other"] },
      { key: "competingAgainst", label: "Competing against", type: "text", hint: "Who else is in the running?" },
      { key: "budgetConfirmed", label: "Budget confirmed", type: "select", options: ["Yes", "Discussed", "Unknown", "No"] },
      { key: "authorityConfirmed", label: "Decision authority confirmed", type: "select", options: ["Yes", "Influencer", "Unknown", "No"] },
    ],
  },

  "Proposal Sent": {
    to: "Proposal Sent",
    title: "Sample outcome confirmed?",
    rationale: "We don't send proposals into a void — log the sample reaction first so the proposal lands with context.",
    requiredFields: [
      { key: "sampleOutcome", label: "Sample outcome", type: "select", options: ["Approved", "Lukewarm", "Needs revision", "No response", "Rejected"] },
    ],
  },

  "Negotiating": {
    to: "Negotiating",
    title: "Pricing locked?",
    rationale: "Negotiation requires a real deal value to forecast against — no zero-dollar deals in this stage.",
    requiredFields: [
      { key: "dealValue", label: "Deal value (monthly)", type: "number", hint: "$/mo (must be > $100)" },
    ],
    customCheck: (lead) => {
      const v = Number(lead.dealValue || 0);
      return v > 100 ? [] : ["Deal value must be greater than $100/mo"];
    },
  },

  "Closed Won": {
    to: "Closed Won",
    title: "Hand off to Client Success?",
    rationale: "Closing this deal auto-creates a Client Success account for Valeria. We need contract terms first.",
    requiredFields: [
      { key: "subscriptionValue", label: "Subscription value (monthly)", type: "number" },
      { key: "contractEnd", label: "Contract end date", type: "date" },
      { key: "tier", label: "Tier", type: "select", options: ["1", "2", "3"], hint: "Tier 1 = top priority CS attention" },
    ],
  },

  "Closed Lost": {
    to: "Closed Lost",
    title: "Why did this deal close lost?",
    rationale: "Closed Lost is final — capture the reason so we improve win rate AND know whether to enroll in 90-day nurture.",
    requiredFields: [
      {
        key: "lostReasonV2" as any,
        label: "Lost reason",
        type: "select",
        options: [
          "Went Dark / No response",
          "Budget",
          "Timing",
          "Lost to competitor",
          "No fit / Not qualified",
          "Champion left",
          "Internal decision delayed",
          "Pricing",
          "Other",
        ],
      },
    ],
  },
};

/**
 * Returns the gate for a destination stage (normalized). Returns null if
 * the destination has no gate (e.g. moving to "Unassigned" or "In Contact").
 */
export function getGateForStage(targetStage: LeadStage): StageGate | null {
  return STAGE_GATES[normalizeStage(targetStage)] ?? null;
}

export interface GateEvaluation {
  /** True if all gate requirements are satisfied. */
  passes: boolean;
  /** Human messages naming what's missing. Empty when passes=true. */
  missing: string[];
  /** The fields the rep needs to fill. */
  missingFields: GateField[];
}

/** Run a gate against a lead and return what's missing. */
export function evaluateGate(lead: Lead, targetStage: LeadStage): GateEvaluation {
  const gate = getGateForStage(targetStage);
  if (!gate) return { passes: true, missing: [], missingFields: [] };

  const missingFields: GateField[] = [];
  const missing: string[] = [];

  for (const f of gate.requiredFields) {
    const v = (lead as any)[f.key];
    const empty =
      v === null ||
      v === undefined ||
      v === "" ||
      (typeof v === "number" && v === 0 && f.type === "number");
    if (empty) {
      missingFields.push(f);
      missing.push(f.label);
    }
  }

  if (gate.customCheck) {
    const extra = gate.customCheck(lead);
    for (const m of extra) if (!missing.includes(m)) missing.push(m);
  }

  return { passes: missing.length === 0, missing, missingFields };
}

/**
 * True if moving from `current` → `target` is a backwards move on the v2
 * pipeline (used to show the "move back" warning, not the gate guard).
 */
export function isBackwardsMove(current: LeadStage, target: LeadStage): boolean {
  const c = normalizeStage(current);
  const t = normalizeStage(target);
  if (TERMINAL_STAGES.includes(c) && !TERMINAL_STAGES.includes(t)) return true; // re-opening a closed deal
  const ci = ACTIVE_STAGES.indexOf(c);
  const ti = ACTIVE_STAGES.indexOf(t);
  return ci >= 0 && ti >= 0 && ti < ci;
}
