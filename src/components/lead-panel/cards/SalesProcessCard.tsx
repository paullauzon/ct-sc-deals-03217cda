import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import { HybridText, type HybridSaveMeta } from "../HybridField";
import {
  deriveCompetingAgainst, deriveDecisionBlocker, deriveStallReason,
  computeCardCompleteness, type DerivedValue,
} from "@/lib/dealDossier";
import { Swords, Sparkles } from "lucide-react";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

const SAMPLE_OUTCOMES = [
  "Awaiting feedback", "Positive — wants more", "Mixed — needs revisions",
  "Rejected — not relevant", "No response",
];

interface Props { lead: Lead; save: (updates: Partial<Lead>) => void; }

export function SalesProcessCard({ lead, save }: Props) {
  if (lead.brand !== "SourceCo") return null;
  const competing = deriveCompetingAgainst(lead);
  const blocker = deriveDecisionBlocker(lead);
  const stall = deriveStallReason(lead);
  const completeness = computeCardCompleteness(lead, "process");

  const saveWithLog = (updates: Partial<Lead>, meta?: HybridSaveMeta) => {
    save(updates);
    if (meta?.confirmed && meta.label) {
      const val = String(Object.values(updates)[0] ?? "");
      logActivity(lead.id, "field_update",
        `Confirmed AI value for ${meta.label}: "${val}"${meta.detail ? ` (source: ${meta.detail})` : ""}`, "", val);
    }
  };

  const confirmAllAI = () => {
    const candidates: { key: keyof Lead; label: string; manual?: string; derived: DerivedValue }[] = [
      { key: "competingAgainst", label: "Competing against", manual: lead.competingAgainst, derived: competing },
      { key: "decisionBlocker",  label: "Decision blocker",  manual: lead.decisionBlocker,  derived: blocker },
      { key: "stallReason",      label: "Stall reason",      manual: lead.stallReason,      derived: stall },
    ];
    const toApply = candidates.filter(c => !c.manual?.trim() && c.derived.value);
    if (!toApply.length) { toast.info("Nothing to confirm — all rows already filled or empty"); return; }
    const updates: Partial<Lead> = {};
    const sources = new Set<string>();
    for (const c of toApply) { (updates as any)[c.key] = c.derived.value; if (c.derived.detail) sources.add(c.derived.detail); }
    save(updates);
    logActivity(lead.id, "field_update",
      `Confirmed ${toApply.length} AI values: ${toApply.map(t => t.label).join(", ")}${sources.size ? ` (sources: ${Array.from(sources).join("; ")})` : ""}`, "", "");
    toast.success(`Confirmed ${toApply.length} AI value${toApply.length === 1 ? "" : "s"}`);
  };

  const pendingAI = [
    [lead.competingAgainst, competing.value],
    [lead.decisionBlocker, blocker.value],
    [lead.stallReason, stall.value],
  ].filter(([m, d]) => !m?.toString().trim() && d).length;

  return (
    <CollapsibleCard
      title="Sales Process"
      icon={<Swords className="h-3.5 w-3.5" />}
      count={`${completeness.filled}/${completeness.total}`}
      defaultOpen
      rightSlot={pendingAI > 0 ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); confirmAllAI(); }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-border/60 hover:border-foreground hover:bg-foreground hover:text-background transition-colors mr-1"
          title={`Confirm all ${pendingAI} AI-suggested value${pendingAI === 1 ? "" : "s"} on this card`}>
          <Sparkles className="h-2.5 w-2.5" />Confirm {pendingAI}
        </button>
      ) : undefined}
    >
      <div className="space-y-0">
        <HybridText label="Competing against" fieldKey="competingAgainst" manual={lead.competingAgainst} derived={competing} onSave={(v, meta) => saveWithLog({ competingAgainst: v }, meta)} />
        <HybridText label="Decision blocker" fieldKey="decisionBlocker" manual={lead.decisionBlocker} derived={blocker} onSave={(v, meta) => saveWithLog({ decisionBlocker: v }, meta)} />
        <InlineTextField label="Sample sent date" value={lead.sampleSentDate || ""} onSave={(v) => save({ sampleSentDate: v })} type="date" />
        <InlineSelectField label="Sample outcome" value={lead.sampleOutcome || ""} options={SAMPLE_OUTCOMES} onSave={(v) => save({ sampleOutcome: v })} allowEmpty />
        <InlineTextField label="Proof notes" value={lead.proofNotes || ""} onSave={(v) => save({ proofNotes: v })} />
        <HybridText label="Stall reason" fieldKey="stallReason" manual={lead.stallReason} derived={stall} onSave={(v, meta) => saveWithLog({ stallReason: v }, meta)} />
      </div>
    </CollapsibleCard>
  );
}
