import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import { HybridText, HybridSelect, type HybridSaveMeta } from "../HybridField";
import {
  deriveAiSuggestions,
  deriveSectorFromSubmission,
  deriveGeographyFromSubmission,
  deriveRevenueFromSubmission,
  deriveEbitdaFromSubmission,
} from "@/lib/dealDossier";
import { Target } from "lucide-react";
import { logActivity } from "@/lib/activityLog";

const DEAL_TYPES = ["Platform", "Add-on / Bolt-on", "Roll-up", "Carve-out", "Distressed", "Growth"];
const TXN_TYPES = ["Majority", "Minority", "Control", "Recap", "100% Buyout"];

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

/** SourceCo-only — PE-buyer mandate. Captarget leads don't render this. */
export function MAMandateCard({ lead, save }: Props) {
  if (lead.brand !== "SourceCo") return null;
  const sug = deriveAiSuggestions(lead);
  const sector = deriveSectorFromSubmission(lead);
  const geo = deriveGeographyFromSubmission(lead);
  const revenue = deriveRevenueFromSubmission(lead);
  const ebitda = deriveEbitdaFromSubmission(lead);

  const saveWithLog = (updates: Partial<Lead>, meta?: HybridSaveMeta) => {
    save(updates);
    if (meta?.confirmed && meta.label) {
      const val = String(Object.values(updates)[0] ?? "");
      logActivity(
        lead.id,
        "field_update",
        `Confirmed AI value for ${meta.label}: "${val}"${meta.detail ? ` (source: ${meta.detail})` : ""}`,
        "",
        val,
      );
    }
  };

  return (
    <CollapsibleCard title="M&A Mandate" icon={<Target className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-0">
        <HybridText
          label="Target sector(s)"
          fieldKey="targetCriteria"
          manual={lead.targetCriteria}
          derived={sector}
          onSave={(v, meta) => saveWithLog({ targetCriteria: v }, meta)}
        />
        <HybridText
          label="Target geography"
          fieldKey="geography"
          manual={lead.geography}
          derived={geo}
          onSave={(v, meta) => saveWithLog({ geography: v }, meta)}
        />
        <HybridText
          label="EBITDA min"
          fieldKey="ebitdaMin"
          manual={lead.ebitdaMin}
          derived={sug.ebitdaMin?.value ? sug.ebitdaMin : ebitda.min}
          onSave={(v, meta) => saveWithLog({ ebitdaMin: v }, meta)}
        />
        <HybridText
          label="EBITDA max"
          fieldKey="ebitdaMax"
          manual={lead.ebitdaMax}
          derived={sug.ebitdaMax?.value ? sug.ebitdaMax : ebitda.max}
          onSave={(v, meta) => saveWithLog({ ebitdaMax: v }, meta)}
        />
        <HybridText
          label="Revenue range"
          fieldKey="targetRevenue"
          manual={lead.targetRevenue}
          derived={revenue}
          onSave={(v, meta) => saveWithLog({ targetRevenue: v }, meta)}
        />
        <HybridSelect
          label="Deal type"
          fieldKey="dealType"
          manual={lead.dealType}
          derived={sug.dealType || { value: "", source: "" }}
          options={DEAL_TYPES}
          onSave={(v, meta) => saveWithLog({ dealType: v }, meta)}
          allowEmpty
        />
        <HybridSelect
          label="Transaction type"
          fieldKey="transactionType"
          manual={lead.transactionType}
          derived={sug.transactionType || { value: "", source: "" }}
          options={TXN_TYPES}
          onSave={(v, meta) => saveWithLog({ transactionType: v }, meta)}
          allowEmpty
        />
        <InlineSelectField
          label="Acquisition strategy"
          value={lead.acquisitionStrategy}
          options={["Build a portfolio", "Single acquisition", "Roll-up strategy", "Strategic add-on", "Other"]}
          onSave={(v) => save({ acquisitionStrategy: v })}
          allowEmpty
        />
        <InlineTextField
          label="Deals planned"
          value={lead.dealsPlanned}
          onSave={(v) => save({ dealsPlanned: v })}
        />
      </div>
    </CollapsibleCard>
  );
}
