import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import { deriveAiSuggestions } from "@/lib/dealDossier";
import { Target, Sparkles } from "lucide-react";

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

  function withGlyph(label: string, derived: { value: string }, manual?: string,
    children?: React.ReactNode) {
    if (manual?.trim() || !derived.value) return children;
    return (
      <div className="relative">
        {children}
        <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60 absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    );
  }

  return (
    <CollapsibleCard title="M&A Mandate" icon={<Target className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-0">
        <InlineTextField
          label="Target sector(s)"
          value={lead.targetCriteria}
          onSave={(v) => save({ targetCriteria: v })}
        />
        <InlineTextField
          label="Target geography"
          value={lead.geography}
          onSave={(v) => save({ geography: v })}
        />
        {withGlyph("EBITDA min", sug.ebitdaMin || { value: "" }, lead.ebitdaMin,
          <InlineTextField
            label="EBITDA min"
            value={lead.ebitdaMin || sug.ebitdaMin?.value || ""}
            onSave={(v) => save({ ebitdaMin: v })}
          />
        )}
        {withGlyph("EBITDA max", sug.ebitdaMax || { value: "" }, lead.ebitdaMax,
          <InlineTextField
            label="EBITDA max"
            value={lead.ebitdaMax || sug.ebitdaMax?.value || ""}
            onSave={(v) => save({ ebitdaMax: v })}
          />
        )}
        <InlineTextField
          label="Revenue range"
          value={lead.targetRevenue}
          onSave={(v) => save({ targetRevenue: v })}
        />
        {withGlyph("Deal type", sug.dealType || { value: "" }, lead.dealType,
          <InlineSelectField
            label="Deal type"
            value={lead.dealType || sug.dealType?.value || ""}
            options={Array.from(new Set([sug.dealType?.value, ...DEAL_TYPES].filter(Boolean) as string[]))}
            onSave={(v) => save({ dealType: v })}
            allowEmpty
          />
        )}
        {withGlyph("Transaction type", sug.transactionType || { value: "" }, lead.transactionType,
          <InlineSelectField
            label="Transaction type"
            value={lead.transactionType || sug.transactionType?.value || ""}
            options={Array.from(new Set([sug.transactionType?.value, ...TXN_TYPES].filter(Boolean) as string[]))}
            onSave={(v) => save({ transactionType: v })}
            allowEmpty
          />
        )}
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
