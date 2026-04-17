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

export interface DerivedValue {
  value: string;
  source: "ai" | "transcript" | "submission" | "research" | "";
}

const empty: DerivedValue = { value: "", source: "" };

export function deriveStakeholderCount(lead: Lead): DerivedValue {
  const map = lead.dealIntelligence?.stakeholderMap;
  if (!map?.length) return empty;
  return { value: String(map.length), source: "transcript" };
}

export function deriveChampion(lead: Lead): DerivedValue {
  const champ = lead.dealIntelligence?.stakeholderMap?.find(s => s.stance === "Champion");
  if (champ?.name) return { value: champ.name, source: "transcript" };
  const bcChamp = lead.dealIntelligence?.buyingCommittee?.champion;
  if (bcChamp) return { value: bcChamp, source: "transcript" };
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
  if (!set.size) return empty;
  return { value: Array.from(set).join(", "), source: "transcript" };
}

export function deriveDecisionBlocker(lead: Lead): DerivedValue {
  const risks = lead.dealIntelligence?.riskRegister || [];
  const sev = (r: RiskRecord) => (r.severity === "Critical" ? 0 : r.severity === "High" ? 1 : 2);
  const open = risks
    .filter(r => r.mitigationStatus !== "Mitigated")
    .sort((a, b) => sev(a) - sev(b));
  if (!open.length) return empty;
  return { value: open[0].risk, source: "transcript" };
}

export function deriveStallReason(lead: Lead): DerivedValue {
  const m = lead.dealIntelligence?.momentumSignals?.momentum;
  if (m !== "Stalled" && m !== "Stalling") return empty;
  const evidence = lead.dealIntelligence?.dealStageEvidence?.trim();
  if (evidence) return { value: evidence, source: "transcript" };
  return { value: `Momentum: ${m}`, source: "transcript" };
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
      return { value: "No", source: "transcript" };
    }
    if (
      lower.includes("confirmed") ||
      lower.includes("approved") ||
      lower.includes("yes") ||
      /\$\s?\d/.test(b)
    ) {
      return { value: "Yes", source: "transcript" };
    }
    return { value: "Unclear", source: "transcript" };
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
    if (t) return { value: t, source: "transcript" };
  }
  const u = lead.enrichment?.urgency?.trim();
  if (u) return { value: u, source: "research" };
  return empty;
}

export function deriveAuthorityConfirmed(lead: Lead): DerivedValue {
  const dm = lead.dealIntelligence?.buyingCommittee?.decisionMaker?.trim();
  if (dm) return { value: `Yes — ${dm}`, source: "transcript" };
  // Heuristic: champion + DM-level title in stakeholder map
  const dmStake = lead.dealIntelligence?.stakeholderMap?.find(
    s => s.influence === "Decision Maker"
  );
  if (dmStake) return { value: `Yes — ${dmStake.name}`, source: "transcript" };
  return empty;
}

export function deriveAiSuggestions(lead: Lead): Record<string, DerivedValue> {
  // enrich-lead may stash a structured `buyerProfileSuggested` block on the
  // enrichment object. We surface it as an "AI" derived value when the user
  // hasn't manually overridden the field yet.
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
      out[k] = { value: v, source: "research" };
    }
  }
  return out;
}
