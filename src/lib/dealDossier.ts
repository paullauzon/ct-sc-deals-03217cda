/**
 * Pure derivation helpers that turn Fireflies transcripts + Deal Intelligence
 * + AI enrichment into ready-to-render values for the Buyer Profile / M&A
 * Mandate / Sales Process cards in the lead detail panel.
 *
 * Every function returns either a string value or empty string. The card
 * layer renders `manual ?? derived` and shows an "AI" affordance when the
 * value is derived rather than user-edited.
 */
import type { Lead, ObjectionRecord, RiskRecord } from "@/types/lead";
import {
  parseFirmTypeFromRole,
  parseFirmTypeFromMessage,
  parseTimelineFromStrategy,
  parseEbitdaFromText,
  parseRevenueFromText,
  parseGeographyFromText,
  parseSectorFromText,
  parseActiveSearchesFromText,
  parseCompetingFromSourcing,
} from "./submissionParser";

export interface DerivedValue {
  value: string;
  /** Where it came from — drives the Sparkles tooltip label. */
  source: "ai" | "transcript" | "submission" | "research" | "";
  /** Optional: short human-readable origin ("Form submission", "Meeting on Mar 12", "Research of acme.com"). */
  detail?: string;
}

const empty: DerivedValue = { value: "", source: "" };

/* ───────────── Submission-tier derivers (deterministic, no AI) ───────────── */

export function deriveFirmTypeFromSubmission(lead: Lead): DerivedValue {
  const fromRole = parseFirmTypeFromRole(lead.role);
  if (fromRole) return { value: fromRole, source: "submission", detail: "Form: role" };
  // Fallback: scan the message for firm-type keywords (covers role="Other")
  const fromMsg = parseFirmTypeFromMessage(lead.message);
  if (fromMsg) return { value: fromMsg, source: "submission", detail: "Form: message" };
  return empty;
}

export function deriveTimelineFromSubmission(lead: Lead): DerivedValue {
  const v = parseTimelineFromStrategy(lead.acquisitionStrategy);
  return v ? { value: v, source: "submission", detail: "Form: acquisition strategy" } : empty;
}

export function deriveSectorFromSubmission(lead: Lead): DerivedValue {
  if (lead.targetCriteria?.trim()) return { value: lead.targetCriteria.trim(), source: "submission", detail: "Form: target criteria" };
  const v = parseSectorFromText(lead.message);
  return v ? { value: v, source: "submission", detail: "Form: message" } : empty;
}

export function deriveGeographyFromSubmission(lead: Lead): DerivedValue {
  if (lead.geography?.trim()) return { value: lead.geography.trim(), source: "submission", detail: "Form: geography" };
  const v = parseGeographyFromText(lead.message);
  return v ? { value: v, source: "submission", detail: "Form: message" } : empty;
}

export function deriveRevenueFromSubmission(lead: Lead): DerivedValue {
  if (lead.targetRevenue?.trim()) return { value: lead.targetRevenue.trim(), source: "submission", detail: "Form: target revenue" };
  const v = parseRevenueFromText(lead.message);
  return v ? { value: v, source: "submission", detail: "Form: message" } : empty;
}

export function deriveEbitdaFromSubmission(lead: Lead): { min: DerivedValue; max: DerivedValue } {
  const { min, max } = parseEbitdaFromText(lead.message);
  return {
    min: min ? { value: min, source: "submission", detail: "Form: message" } : empty,
    max: max ? { value: max, source: "submission", detail: "Form: message" } : empty,
  };
}

export function deriveActiveSearchesFromSubmission(lead: Lead): DerivedValue {
  const fromMsg = parseActiveSearchesFromText(lead.message);
  if (fromMsg) return { value: fromMsg, source: "submission", detail: "Form: message" };
  if (lead.dealsPlanned?.trim()) return { value: lead.dealsPlanned.trim(), source: "submission", detail: "Form: deals planned" };
  return empty;
}

export function deriveCompetingFromSubmission(lead: Lead): DerivedValue {
  const v = parseCompetingFromSourcing(lead.currentSourcing);
  return v ? { value: v, source: "submission", detail: "Form: current sourcing" } : empty;
}

/** SourceCo form's `acquisition_strategy` raw value — the prospect's own words about where they are. */
export function deriveSelfStatedStage(lead: Lead): DerivedValue {
  const s = (lead.acquisitionStrategy || "").trim();
  if (!s) return empty;
  return { value: s, source: "submission", detail: "Form: acquisition strategy (verbatim)" };
}

export function deriveStakeholderCount(lead: Lead): DerivedValue {
  const map = lead.dealIntelligence?.stakeholderMap;
  if (!map?.length) return empty;
  return { value: String(map.length), source: "transcript", detail: "Extracted from meeting transcripts" };
}

export function deriveChampion(lead: Lead): DerivedValue {
  const champ = lead.dealIntelligence?.stakeholderMap?.find(s => s.stance === "Champion");
  if (champ?.name) return { value: champ.name, source: "transcript", detail: "Extracted from meeting transcripts" };
  const bcChamp = lead.dealIntelligence?.buyingCommittee?.champion;
  if (bcChamp) return { value: bcChamp, source: "transcript", detail: "Extracted from meeting transcripts" };
  return empty;
}

export function deriveCompetingAgainst(lead: Lead): DerivedValue {
  const set = new Set<string>();
  if (lead.competingBankers?.trim()) {
    lead.competingBankers.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(s => set.add(s));
  }
  lead.dealIntelligence?.objectionTracker?.forEach((o: ObjectionRecord) => {
    const m = o.objection?.match(/(?:vs\.?|against|competing with|considering)\s+([A-Z][\w &]+)/i);
    if (m?.[1]) set.add(m[1].trim());
  });
  lead.meetings?.forEach(m => {
    m.intelligence?.dealSignals?.competitors?.forEach(c => c && set.add(c));
  });
  if (set.size) return { value: Array.from(set).join(", "), source: "transcript", detail: "Extracted from meeting transcripts" };
  // Submission-tier fallback: SourceCo's `currentSourcing` answers "how are you sourcing today?"
  return deriveCompetingFromSubmission(lead);
}

export function deriveDecisionBlocker(lead: Lead): DerivedValue {
  const risks = lead.dealIntelligence?.riskRegister || [];
  const sev = (r: RiskRecord) => (r.severity === "Critical" ? 0 : r.severity === "High" ? 1 : 2);
  const open = risks
    .filter(r => r.mitigationStatus !== "Mitigated")
    .sort((a, b) => sev(a) - sev(b));
  if (!open.length) return empty;
  return { value: open[0].risk, source: "transcript", detail: "Top open risk from deal intelligence" };
}

export function deriveStallReason(lead: Lead): DerivedValue {
  const m = lead.dealIntelligence?.momentumSignals?.momentum;
  if (m === "Stalled" || m === "Stalling") {
    const evidence = lead.dealIntelligence?.dealStageEvidence?.trim();
    if (evidence) return { value: evidence, source: "transcript", detail: "Momentum evidence from transcripts" };
    return { value: `Momentum: ${m}`, source: "transcript", detail: "Momentum signal from transcripts" };
  }
  // Submission-tier fallback: prospect explicitly said "We're exploring options" / "thesis-building"
  // → low urgency, often the de-facto stall reason for early-funnel inertia.
  const strat = (lead.acquisitionStrategy || "").toLowerCase();
  if (strat.includes("exploring") || strat.includes("thesis")) {
    return {
      value: `Self-identified as ${lead.acquisitionStrategy.trim()} (low urgency)`,
      source: "submission",
      detail: "Form: acquisition strategy",
    };
  }
  return empty;
}

export function deriveBudgetConfirmed(lead: Lead): DerivedValue {
  // Look across all meetings — most recent wins.
  const ordered = [...(lead.meetings || [])].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  for (const m of ordered) {
    const b = m.intelligence?.dealSignals?.budgetMentioned?.trim();
    if (!b) continue;
    const lower = b.toLowerCase();
    if (lower.includes("not") || lower.includes("no budget") || lower === "no") {
      return { value: "No", source: "transcript", detail: `Mentioned in meeting ${m.date || ""}`.trim() };
    }
    if (
      lower.includes("confirmed") ||
      lower.includes("approved") ||
      lower.includes("yes") ||
      /\$\s?\d/.test(b)
    ) {
      return { value: "Yes", source: "transcript", detail: `Mentioned in meeting ${m.date || ""}`.trim() };
    }
    return { value: "Unclear", source: "transcript", detail: `Mentioned in meeting ${m.date || ""}`.trim() };
  }
  return empty;
}

export function deriveAcqTimeline(lead: Lead): DerivedValue {
  // Prefer most-recent meeting's stated timeline; fall back to enrichment.urgency.
  const ordered = [...(lead.meetings || [])].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  for (const m of ordered) {
    const t = m.intelligence?.dealSignals?.timeline?.trim();
    if (t) return { value: t, source: "transcript", detail: `Mentioned in meeting ${m.date || ""}`.trim() };
  }
  const u = lead.enrichment?.urgency?.trim();
  if (u) return { value: u, source: "research", detail: "AI research" };
  return deriveTimelineFromSubmission(lead);
}

export function deriveAuthorityConfirmed(lead: Lead): DerivedValue {
  const dm = lead.dealIntelligence?.buyingCommittee?.decisionMaker?.trim();
  if (dm) return { value: `Yes — ${dm}`, source: "transcript", detail: "Decision maker from buying committee" };
  const dmStake = lead.dealIntelligence?.stakeholderMap?.find(
    s => s.influence === "Decision Maker"
  );
  if (dmStake) return { value: `Yes — ${dmStake.name}`, source: "transcript", detail: "Decision maker from stakeholder map" };
  return empty;
}

export function deriveAiSuggestions(lead: Lead): Record<string, DerivedValue> {
  const sug = (lead.enrichment as any)?.buyerProfileSuggested as
    | Partial<{
        firmAum: string;
        acqTimeline: string;
        activeSearches: string;
        ebitdaMin: string;
        ebitdaMax: string;
        dealType: string;
        transactionType: string;
        authorityConfirmed: string;
      }>
    | undefined;
  const out: Record<string, DerivedValue> = {};
  if (!sug) return out;
  for (const [k, v] of Object.entries(sug)) {
    if (typeof v === "string" && v.trim()) {
      out[k] = { value: v, source: "research", detail: "AI research" };
    }
  }
  return out;
}

/* ───────────── Dossier completeness — drives the header chip ───────────── */

/** Returns 0-100 % of "filled" rows across Buyer Profile + M&A Mandate + Sales Process. */
export function computeDossierCompleteness(lead: Lead): { pct: number; filled: number; total: number } {
  const sug = deriveAiSuggestions(lead);
  const eb = deriveEbitdaFromSubmission(lead);
  const has = (manual: string | undefined, derived?: DerivedValue) =>
    !!(manual && manual.trim()) || !!(derived && derived.value);

  const rows: boolean[] = lead.brand === "SourceCo"
    ? [
        // Buyer Profile
        has(lead.buyerType, deriveFirmTypeFromSubmission(lead)),
        has(lead.firmAum, sug.firmAum),
        has(lead.acquisitionStrategy, deriveSelfStatedStage(lead)),
        has(lead.acqTimeline, deriveAcqTimeline(lead)),
        has(lead.activeSearches, deriveActiveSearchesFromSubmission(lead)),
        has(undefined, deriveStakeholderCount(lead)),
        has(undefined, deriveChampion(lead)),
        has(lead.budgetConfirmed, deriveBudgetConfirmed(lead)),
        has(lead.authorityConfirmed, deriveAuthorityConfirmed(lead)),
        // M&A Mandate
        has(lead.targetCriteria, deriveSectorFromSubmission(lead)),
        has(lead.geography, deriveGeographyFromSubmission(lead)),
        has(lead.ebitdaMin, sug.ebitdaMin?.value ? sug.ebitdaMin : eb.min),
        has(lead.ebitdaMax, sug.ebitdaMax?.value ? sug.ebitdaMax : eb.max),
        has(lead.targetRevenue, deriveRevenueFromSubmission(lead)),
        has(lead.dealType, sug.dealType),
        has(lead.transactionType, sug.transactionType),
        has(lead.acquisitionStrategy),
        has(lead.dealsPlanned),
        // Sales Process
        has(lead.competingAgainst, deriveCompetingAgainst(lead)),
        has(lead.decisionBlocker, deriveDecisionBlocker(lead)),
        has(lead.stallReason, deriveStallReason(lead)),
      ]
    : [
        // Captarget — leaner subset
        has(lead.acqTimeline, deriveAcqTimeline(lead)),
        has(lead.budgetConfirmed, deriveBudgetConfirmed(lead)),
        has(lead.authorityConfirmed, deriveAuthorityConfirmed(lead)),
        has(undefined, deriveStakeholderCount(lead)),
        has(undefined, deriveChampion(lead)),
        has(lead.competingAgainst, deriveCompetingAgainst(lead)),
        has(lead.decisionBlocker, deriveDecisionBlocker(lead)),
      ];

  const filled = rows.filter(Boolean).length;
  const total = rows.length;
  return { pct: total ? Math.round((filled / total) * 100) : 0, filled, total };
}
