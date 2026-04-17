import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import {
  deriveAiSuggestions,
  deriveSectorFromSubmission,
  deriveGeographyFromSubmission,
  deriveRevenueFromSubmission,
  deriveEbitdaFromSubmission,
  type DerivedValue,
} from "@/lib/dealDossier";
import { Target, Sparkles } from "lucide-react";

const DEAL_TYPES = ["Platform", "Add-on / Bolt-on", "Roll-up", "Carve-out", "Distressed", "Growth"];
const TXN_TYPES = ["Majority", "Minority", "Control", "Recap", "100% Buyout"];

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

/** Editable row that prefers manual, falls back to AI/submission derived value with a Sparkles glyph. */
function HybridText({
  label,
  manual,
  derived,
  onSave,
  type = "text",
}: {
  label: string;
  manual?: string;
  derived: DerivedValue;
  onSave: (v: string) => void;
  type?: "text" | "number" | "date";
}) {
  if (manual && manual.trim()) {
    return <InlineTextField label={label} value={manual} onSave={onSave} type={type} />;
  }
  if (!derived.value) {
    return <InlineTextField label={label} value="" onSave={onSave} type={type} />;
  }
  return (
    <div className="relative">
      <InlineTextField label={label} value={derived.value} onSave={onSave} type={type} />
      <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60 absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

function HybridSelect({
  label,
  manual,
  derived,
  options,
  onSave,
  allowEmpty,
}: {
  label: string;
  manual?: string;
  derived: DerivedValue;
  options: string[];
  onSave: (v: string) => void;
  allowEmpty?: boolean;
}) {
  if (manual && manual.trim()) {
    return <InlineSelectField label={label} value={manual} options={options} onSave={onSave} allowEmpty={allowEmpty} />;
  }
  if (!derived.value) {
    return <InlineSelectField label={label} value="" options={options} onSave={onSave} allowEmpty={allowEmpty} />;
  }
  return (
    <div className="relative">
      <InlineSelectField
        label={label}
        value={derived.value}
        options={Array.from(new Set([derived.value, ...options]))}
        onSave={onSave}
        allowEmpty={allowEmpty}
      />
      <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60 absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

/** SourceCo-only — PE-buyer mandate. Captarget leads don't render this. */
export function MAMandateCard({ lead, save }: Props) {
  if (lead.brand !== "SourceCo") return null;
  const sug = deriveAiSuggestions(lead);
  const sector = deriveSectorFromSubmission(lead);
  const geo = deriveGeographyFromSubmission(lead);
  const revenue = deriveRevenueFromSubmission(lead);
  const ebitda = deriveEbitdaFromSubmission(lead);

  return (
    <CollapsibleCard title="M&A Mandate" icon={<Target className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-0">
        <HybridText
          label="Target sector(s)"
          manual={lead.targetCriteria}
          derived={sector}
          onSave={(v) => save({ targetCriteria: v })}
        />
        <HybridText
          label="Target geography"
          manual={lead.geography}
          derived={geo}
          onSave={(v) => save({ geography: v })}
        />
        <HybridText
          label="EBITDA min"
          manual={lead.ebitdaMin}
          derived={sug.ebitdaMin?.value ? sug.ebitdaMin : ebitda.min}
          onSave={(v) => save({ ebitdaMin: v })}
        />
        <HybridText
          label="EBITDA max"
          manual={lead.ebitdaMax}
          derived={sug.ebitdaMax?.value ? sug.ebitdaMax : ebitda.max}
          onSave={(v) => save({ ebitdaMax: v })}
        />
        <HybridText
          label="Revenue range"
          manual={lead.targetRevenue}
          derived={revenue}
          onSave={(v) => save({ targetRevenue: v })}
        />
        <HybridSelect
          label="Deal type"
          manual={lead.dealType}
          derived={sug.dealType || { value: "", source: "" }}
          options={DEAL_TYPES}
          onSave={(v) => save({ dealType: v })}
          allowEmpty
        />
        <HybridSelect
          label="Transaction type"
          manual={lead.transactionType}
          derived={sug.transactionType || { value: "", source: "" }}
          options={TXN_TYPES}
          onSave={(v) => save({ transactionType: v })}
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
