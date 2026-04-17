import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import { HybridText, HybridSelect, type HybridSaveMeta } from "../HybridField";
import {
  deriveAiSuggestions, deriveSectorFromSubmission, deriveGeographyFromSubmission,
  deriveRevenueFromSubmission, deriveEbitdaFromSubmission, computeCardCompleteness,
  type DerivedValue,
} from "@/lib/dealDossier";
import { Target, Sparkles } from "lucide-react";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";

const DEAL_TYPES = ["Platform", "Add-on / Bolt-on", "Roll-up", "Carve-out", "Distressed", "Growth"];
const TXN_TYPES = ["Majority", "Minority", "Control", "Recap", "100% Buyout"];

interface Props { lead: Lead; save: (updates: Partial<Lead>) => void; }

export function MAMandateCard({ lead, save }: Props) {
  if (lead.brand !== "SourceCo") return null;
  const sug = deriveAiSuggestions(lead);
  const sector = deriveSectorFromSubmission(lead);
  const geo = deriveGeographyFromSubmission(lead);
  const revenue = deriveRevenueFromSubmission(lead);
  const ebitda = deriveEbitdaFromSubmission(lead);
  const completeness = computeCardCompleteness(lead, "mandate");

  const saveWithLog = (updates: Partial<Lead>, meta?: HybridSaveMeta) => {
    save(updates);
    if (meta?.confirmed && meta.label) {
      const val = String(Object.values(updates)[0] ?? "");
      logActivity(lead.id, "field_update",
        `Confirmed AI value for ${meta.label}: "${val}"${meta.detail ? ` (source: ${meta.detail})` : ""}`, "", val);
    }
  };

  const ebMin = sug.ebitdaMin?.value ? sug.ebitdaMin : ebitda.min;
  const ebMax = sug.ebitdaMax?.value ? sug.ebitdaMax : ebitda.max;

  const confirmAllAI = () => {
    const candidates: { key: keyof Lead; label: string; manual?: string; derived: DerivedValue }[] = [
      { key: "targetCriteria",  label: "Target sector(s)",  manual: lead.targetCriteria,  derived: sector },
      { key: "geography",       label: "Target geography",  manual: lead.geography,       derived: geo },
      { key: "ebitdaMin",       label: "EBITDA min",        manual: lead.ebitdaMin,       derived: ebMin },
      { key: "ebitdaMax",       label: "EBITDA max",        manual: lead.ebitdaMax,       derived: ebMax },
      { key: "targetRevenue",   label: "Revenue range",     manual: lead.targetRevenue,   derived: revenue },
      { key: "dealType",        label: "Deal type",         manual: lead.dealType,        derived: sug.dealType || { value: "", source: "" } },
      { key: "transactionType", label: "Transaction type",  manual: lead.transactionType, derived: sug.transactionType || { value: "", source: "" } },
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
    [lead.targetCriteria, sector.value],
    [lead.geography, geo.value],
    [lead.ebitdaMin, ebMin.value],
    [lead.ebitdaMax, ebMax.value],
    [lead.targetRevenue, revenue.value],
    [lead.dealType, sug.dealType?.value || ""],
    [lead.transactionType, sug.transactionType?.value || ""],
  ].filter(([m, d]) => !m?.toString().trim() && d).length;

  return (
    <CollapsibleCard
      title="M&A Mandate"
      icon={<Target className="h-3.5 w-3.5" />}
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
        <HybridText label="Target sector(s)" fieldKey="targetCriteria" manual={lead.targetCriteria} derived={sector} onSave={(v, meta) => saveWithLog({ targetCriteria: v }, meta)} />
        <HybridText label="Target geography" fieldKey="geography" manual={lead.geography} derived={geo} onSave={(v, meta) => saveWithLog({ geography: v }, meta)} />
        <HybridText label="EBITDA min" fieldKey="ebitdaMin" manual={lead.ebitdaMin} derived={ebMin} onSave={(v, meta) => saveWithLog({ ebitdaMin: v }, meta)} />
        <HybridText label="EBITDA max" fieldKey="ebitdaMax" manual={lead.ebitdaMax} derived={ebMax} onSave={(v, meta) => saveWithLog({ ebitdaMax: v }, meta)} />
        <HybridText label="Revenue range" fieldKey="targetRevenue" manual={lead.targetRevenue} derived={revenue} onSave={(v, meta) => saveWithLog({ targetRevenue: v }, meta)} />
        <HybridSelect label="Deal type" fieldKey="dealType" manual={lead.dealType} derived={sug.dealType || { value: "", source: "" }} options={DEAL_TYPES} onSave={(v, meta) => saveWithLog({ dealType: v }, meta)} allowEmpty />
        <HybridSelect label="Transaction type" fieldKey="transactionType" manual={lead.transactionType} derived={sug.transactionType || { value: "", source: "" }} options={TXN_TYPES} onSave={(v, meta) => saveWithLog({ transactionType: v }, meta)} allowEmpty />
        <InlineSelectField label="Acquisition strategy" value={lead.acquisitionStrategy} options={["Build a portfolio", "Single acquisition", "Roll-up strategy", "Strategic add-on", "Other"]} onSave={(v) => save({ acquisitionStrategy: v })} allowEmpty />
        <InlineTextField label="Deals planned" value={lead.dealsPlanned} onSave={(v) => save({ dealsPlanned: v })} />
      </div>
    </CollapsibleCard>
  );
}
