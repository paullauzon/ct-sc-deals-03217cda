import { Lead, LeadStage } from "@/types/lead";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline v2 — single source of truth for stage names, ordering, and grouping.
// All UI/logic that references stages MUST import from here. Old hardcoded
// stage arrays scattered across the codebase are being replaced by these.
// ─────────────────────────────────────────────────────────────────────────────

/** The 7 stages a deal moves through while still active (Unassigned → Negotiating). */
export const ACTIVE_STAGES: LeadStage[] = [
  "Unassigned",
  "In Contact",
  "Discovery Scheduled",
  "Discovery Completed",
  "Sample Sent",
  "Proposal Sent",
  "Negotiating",
];

/** Terminal stages — no further movement, used for filtering closed deals. */
export const TERMINAL_STAGES: LeadStage[] = ["Closed Won", "Closed Lost"];

/** All v2 stages combined (drop-down order). */
export const ALL_STAGES: LeadStage[] = [...ACTIVE_STAGES, ...TERMINAL_STAGES];

/** Late-stage transitions where slip-risk and gate-enforcement matter most. */
export const LATE_STAGES: LeadStage[] = ["Sample Sent", "Proposal Sent", "Negotiating"];

/** Stages that count as "closed" for pipeline value calculations. */
export const CLOSED_STAGES: LeadStage[] = ["Closed Won", "Closed Lost"];

/** Legacy stage names still found in the DB. Translated → v2 via STAGE_LABEL_MAP. */
export const LEGACY_STAGES: LeadStage[] = [
  "New Lead",
  "Qualified",
  "Contacted",
  "Meeting Set",
  "Meeting Held",
  "Negotiation",
  "Contract Sent",
  "Revisit/Reconnect",
  "Lost",
  "Went Dark",
];

/**
 * Translates legacy stage names to their v2 equivalent for display + pipeline
 * grouping. Allows us to ship the new pipeline UI without touching DB rows.
 */
export const STAGE_LABEL_MAP: Record<string, LeadStage> = {
  // Legacy → v2
  "New Lead": "Unassigned",
  "Qualified": "In Contact",
  "Contacted": "In Contact",
  "Meeting Set": "Discovery Scheduled",
  "Meeting Held": "Discovery Completed",
  "Negotiation": "Negotiating",
  "Contract Sent": "Negotiating",
  "Revisit/Reconnect": "Closed Lost",
  "Lost": "Closed Lost",
  "Went Dark": "Closed Lost",
  // v2 names → identity (so callers don't have to special-case)
  "Unassigned": "Unassigned",
  "In Contact": "In Contact",
  "Discovery Scheduled": "Discovery Scheduled",
  "Discovery Completed": "Discovery Completed",
  "Sample Sent": "Sample Sent",
  "Proposal Sent": "Proposal Sent",
  "Negotiating": "Negotiating",
  "Closed Won": "Closed Won",
  "Closed Lost": "Closed Lost",
};

/**
 * Translate any stage value (legacy or v2) into its canonical v2 stage.
 * Use everywhere reads happen so legacy DB data shows the new label.
 */
export function normalizeStage(stage: string | null | undefined): LeadStage {
  if (!stage) return "Unassigned";
  return STAGE_LABEL_MAP[stage] ?? (stage as LeadStage);
}

/** True if a stage (after normalization) is one of the 7 active stages. */
export function isActiveStage(stage: LeadStage): boolean {
  return ACTIVE_STAGES.includes(normalizeStage(stage));
}

/** True if a stage (after normalization) is closed (won or lost). */
export function isClosedStage(stage: LeadStage): boolean {
  return CLOSED_STAGES.includes(normalizeStage(stage));
}

/** True if a stage (after normalization) is a late-stage funnel position. */
export function isLateStage(stage: LeadStage): boolean {
  return LATE_STAGES.includes(normalizeStage(stage));
}

/** Compute days in current stage dynamically from stageEnteredDate. */
export function computeDaysInStage(stageEnteredDate: string): number {
  if (!stageEnteredDate) return 0;
  const entered = new Date(stageEnteredDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - entered) / (1000 * 60 * 60 * 24)));
}

// ─── Company association helpers (unchanged from v1) ──────────────────────

function extractDomain(url?: string, email?: string): string | null {
  if (url) {
    try {
      const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
      return hostname.replace(/^www\./, "").toLowerCase();
    } catch { /* ignore */ }
  }
  if (email) {
    const parts = email.split("@");
    if (parts.length === 2) {
      const domain = parts[1].toLowerCase();
      const generic = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "mail.com", "protonmail.com"];
      if (!generic.includes(domain)) return domain;
    }
  }
  return null;
}

export function getCompanyAssociates(lead: Lead, allLeads: Lead[]): Lead[] {
  const domain = extractDomain(lead.companyUrl, lead.email);
  const companyNorm = lead.company?.trim().toLowerCase();

  return allLeads.filter((other) => {
    if (other.id === lead.id) return false;
    if (domain) {
      const otherDomain = extractDomain(other.companyUrl, other.email);
      if (otherDomain === domain) return true;
    }
    if (companyNorm && companyNorm.length > 1) {
      const otherCompany = other.company?.trim().toLowerCase();
      if (otherCompany === companyNorm) return true;
    }
    return false;
  });
}

export function getSharedIntelligence(associates: Lead[]): { painPoints: string[]; objections: string[]; totalMeetings: number } {
  const painPoints = new Set<string>();
  const objections = new Set<string>();
  let totalMeetings = 0;

  for (const lead of associates) {
    totalMeetings += (lead.meetings?.length || 0);
    for (const m of lead.meetings || []) {
      if (!m.intelligence) continue;
      m.intelligence.painPoints?.forEach(p => painPoints.add(p));
      m.intelligence.dealSignals?.objections?.forEach(o => objections.add(o));
    }
  }

  return {
    painPoints: [...painPoints].slice(0, 3),
    objections: [...objections].slice(0, 3),
    totalMeetings,
  };
}
