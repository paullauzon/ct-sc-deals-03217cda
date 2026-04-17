import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import {
  deriveStakeholderCount,
  deriveChampion,
  deriveBudgetConfirmed,
  deriveAcqTimeline,
  deriveAuthorityConfirmed,
  deriveAiSuggestions,
  deriveFirmTypeFromSubmission,
  deriveActiveSearchesFromSubmission,
  deriveSelfStatedStage,
  computeCardCompleteness,
  type DerivedValue,
} from "@/lib/dealDossier";
import { Building2, Sparkles } from "lucide-react";
import { HybridText, HybridSelect, DerivedRow, type HybridSaveMeta } from "../HybridField";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

const FIRM_TYPES = [
  "Independent Sponsor", "Search Fund", "Family Office", "PE Firm",
  "Strategic / Corporate", "HNWI", "Holdco", "Other",
];
const TIMELINES = ["0-3 months", "3-6 months", "6-12 months", "12+ months", "Opportunistic"];
const YES_NO_UNCLEAR = ["Yes", "No", "Unclear"];

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

export function BuyerProfileCard({ lead, save }: Props) {
  const stakeholders = deriveStakeholderCount(lead);
  const champion = deriveChampion(lead);
  const budget = deriveBudgetConfirmed(lead);
  const timeline = deriveAcqTimeline(lead);
  const authority = deriveAuthorityConfirmed(lead);
  const sug = deriveAiSuggestions(lead);
  const firmTypeSubmission = deriveFirmTypeFromSubmission(lead);
  const activeSearchesSubmission = deriveActiveSearchesFromSubmission(lead);
  const selfStated = deriveSelfStatedStage(lead);
  const completeness = computeCardCompleteness(lead, "buyerProfile");
  const awaitingMeeting = !lead.meetings || lead.meetings.length === 0;

  const saveWithLog = (updates: Partial<Lead>, meta?: HybridSaveMeta) => {
    save(updates);
    if (meta?.confirmed && meta.label) {
      const val = String(Object.values(updates)[0] ?? "");
      logActivity(lead.id, "field_update",
        `Confirmed AI value for ${meta.label}: "${val}"${meta.detail ? ` (source: ${meta.detail})` : ""}`,
        "", val);
    }
  };

  const confirmAllAI = () => {
    const candidates: { key: keyof Lead; label: string; manual?: string; derived: DerivedValue }[] = [
      { key: "buyerType",          label: "Firm type",           manual: lead.buyerType,          derived: firmTypeSubmission },
      { key: "firmAum",            label: "Firm AUM",            manual: lead.firmAum,            derived: sug.firmAum || { value: "", source: "" } },
      { key: "acqTimeline",        label: "Acq. timeline",       manual: lead.acqTimeline,        derived: timeline },
      { key: "activeSearches",     label: "Active searches",     manual: lead.activeSearches,     derived: sug.activeSearches?.value ? sug.activeSearches : activeSearchesSubmission },
      { key: "budgetConfirmed",    label: "Budget confirmed",    manual: lead.budgetConfirmed,    derived: budget },
      { key: "authorityConfirmed", label: "Authority confirmed", manual: lead.authorityConfirmed, derived: sug.authorityConfirmed?.value ? sug.authorityConfirmed : authority },
    ];
    const toApply = candidates.filter(c => !c.manual?.trim() && c.derived.value);
    if (!toApply.length) { toast.info("Nothing to confirm — all rows already filled or empty"); return; }
    const updates: Partial<Lead> = {};
    const sources = new Set<string>();
    for (const c of toApply) { (updates as any)[c.key] = c.derived.value; if (c.derived.detail) sources.add(c.derived.detail); }
    save(updates);
    logActivity(lead.id, "field_update",
      `Confirmed ${toApply.length} AI values: ${toApply.map(t => t.label).join(", ")}${sources.size ? ` (sources: ${Array.from(sources).join("; ")})` : ""}`,
      "", "");
    toast.success(`Confirmed ${toApply.length} AI value${toApply.length === 1 ? "" : "s"}`);
  };

  const pendingAI = [
    [lead.buyerType, firmTypeSubmission.value],
    [lead.firmAum, sug.firmAum?.value],
    [lead.acqTimeline, timeline.value],
    [lead.activeSearches, sug.activeSearches?.value || activeSearchesSubmission.value],
    [lead.budgetConfirmed, budget.value],
    [lead.authorityConfirmed, sug.authorityConfirmed?.value || authority.value],
  ].filter(([m, d]) => !m?.toString().trim() && d).length;

  return (
    <CollapsibleCard
      title="Buyer Profile"
      icon={<Building2 className="h-3.5 w-3.5" />}
      count={`${completeness.filled}/${completeness.total}`}
      defaultOpen
      smallCapsTitle
      rightSlot={pendingAI > 0 ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); confirmAllAI(); }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-border/60 hover:border-foreground hover:bg-foreground hover:text-background transition-colors mr-1"
          title={`Confirm all ${pendingAI} AI-suggested value${pendingAI === 1 ? "" : "s"} on this card`}>
          <Sparkles className="h-2.5 w-2.5" />Confirm {pendingAI}
        </button>
      ) : undefined}
    >
      <div className="space-y-0">
        <HybridSelect label="Firm type" fieldKey="buyerType" manual={lead.buyerType} derived={firmTypeSubmission} options={FIRM_TYPES} onSave={(v, meta) => saveWithLog({ buyerType: v }, meta)} allowEmpty />
        <HybridText label="Firm AUM" fieldKey="firmAum" manual={lead.firmAum} derived={sug.firmAum || { value: "", source: "" }} onSave={(v, meta) => saveWithLog({ firmAum: v }, meta)} />
        {lead.brand === "SourceCo" && selfStated.value && (
          <DerivedRow label="Self-stated stage" derived={selfStated} fieldKey="selfStatedStage" />
        )}
        <HybridSelect label="Acq. timeline" fieldKey="acqTimeline" manual={lead.acqTimeline} derived={timeline} options={TIMELINES} onSave={(v, meta) => saveWithLog({ acqTimeline: v }, meta)} allowEmpty />
        <HybridText label="Active searches" fieldKey="activeSearches" manual={lead.activeSearches} derived={sug.activeSearches?.value ? sug.activeSearches : activeSearchesSubmission} onSave={(v, meta) => saveWithLog({ activeSearches: v }, meta)} />
        <DerivedRow label="Stakeholders" derived={stakeholders} fieldKey="stakeholders" awaitingMeeting={awaitingMeeting} />
        <DerivedRow label="Champion" derived={champion} fieldKey="champion" awaitingMeeting={awaitingMeeting} />
        <HybridSelect label="Budget confirmed" fieldKey="budgetConfirmed" manual={lead.budgetConfirmed} derived={budget} options={YES_NO_UNCLEAR} onSave={(v, meta) => saveWithLog({ budgetConfirmed: v }, meta)} allowEmpty awaitingMeeting={awaitingMeeting} />
        <HybridText label="Authority confirmed" fieldKey="authorityConfirmed" manual={lead.authorityConfirmed}
          derived={sug.authorityConfirmed && sug.authorityConfirmed.value ? sug.authorityConfirmed : authority}
          onSave={(v, meta) => saveWithLog({ authorityConfirmed: v }, meta)} awaitingMeeting={awaitingMeeting} />
      </div>
    </CollapsibleCard>
  );
}
