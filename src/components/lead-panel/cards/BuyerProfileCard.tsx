import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import {
  deriveStakeholderCount,
  deriveChampion,
  deriveBudgetConfirmed,
  deriveAcqTimeline,
  deriveAuthorityConfirmed,
  deriveAiSuggestions,
  deriveFirmTypeFromSubmission,
  deriveActiveSearchesFromSubmission,
  type DerivedValue,
} from "@/lib/dealDossier";
import { Building2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const FIRM_TYPES = [
  "Independent Sponsor",
  "Search Fund",
  "Family Office",
  "PE Firm",
  "Strategic / Corporate",
  "HNWI",
  "Holdco",
  "Other",
];
const TIMELINES = ["0-3 months", "3-6 months", "6-12 months", "12+ months", "Opportunistic"];
const YES_NO_UNCLEAR = ["Yes", "No", "Unclear"];

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

/**
 * Read-only derived row — used for "Stakeholders" and "Champion" which are
 * inferred from Fireflies transcripts and not directly editable here (you
 * edit them inside the Stakeholder card on the Activity tab).
 */
function DerivedRow({ label, derived }: { label: string; derived: DerivedValue }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right truncate font-medium flex items-center gap-1.5 max-w-[60%]">
        {derived.value ? (
          <>
            <span className="truncate">{derived.value}</span>
            <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
          </>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>
    </div>
  );
}

/**
 * Editable row that prefers the manual value, falls back to AI-derived, and
 * shows a tiny Sparkles glyph when the displayed value came from AI/transcripts.
 */
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
      <Sparkles
        className={cn(
          "h-2.5 w-2.5 text-muted-foreground/60 absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none"
        )}
      />
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
    return (
      <InlineSelectField
        label={label}
        value={manual}
        options={options}
        onSave={onSave}
        allowEmpty={allowEmpty}
      />
    );
  }
  if (!derived.value) {
    return (
      <InlineSelectField
        label={label}
        value=""
        options={options}
        onSave={onSave}
        allowEmpty={allowEmpty}
      />
    );
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

export function BuyerProfileCard({ lead, save }: Props) {
  const stakeholders = deriveStakeholderCount(lead);
  const champion = deriveChampion(lead);
  const budget = deriveBudgetConfirmed(lead);
  const timeline = deriveAcqTimeline(lead);
  const authority = deriveAuthorityConfirmed(lead);
  const sug = deriveAiSuggestions(lead);
  const firmTypeSubmission = deriveFirmTypeFromSubmission(lead);
  const activeSearchesSubmission = deriveActiveSearchesFromSubmission(lead);

  return (
    <CollapsibleCard title="Buyer Profile" icon={<Building2 className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-0">
        <HybridSelect
          label="Firm type"
          manual={lead.buyerType}
          derived={firmTypeSubmission}
          options={FIRM_TYPES}
          onSave={(v) => save({ buyerType: v })}
          allowEmpty
        />
        <HybridText
          label="Firm AUM"
          manual={lead.firmAum}
          derived={sug.firmAum || { value: "", source: "" }}
          onSave={(v) => save({ firmAum: v })}
        />
        <HybridSelect
          label="Acq. timeline"
          manual={lead.acqTimeline}
          derived={timeline}
          options={TIMELINES}
          onSave={(v) => save({ acqTimeline: v })}
          allowEmpty
        />
        <DerivedRow label="Stakeholders" derived={stakeholders} />
        <DerivedRow label="Champion" derived={champion} />
        <HybridText
          label="Active searches"
          manual={lead.activeSearches}
          derived={sug.activeSearches?.value ? sug.activeSearches : activeSearchesSubmission}
          onSave={(v) => save({ activeSearches: v })}
        />
        <HybridSelect
          label="Budget confirmed"
          manual={lead.budgetConfirmed}
          derived={budget}
          options={YES_NO_UNCLEAR}
          onSave={(v) => save({ budgetConfirmed: v })}
          allowEmpty
        />
        <HybridText
          label="Authority confirmed"
          manual={lead.authorityConfirmed}
          derived={
            sug.authorityConfirmed && sug.authorityConfirmed.value
              ? sug.authorityConfirmed
              : authority
          }
          onSave={(v) => save({ authorityConfirmed: v })}
        />
      </div>
    </CollapsibleCard>
  );
}
