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
} from "@/lib/dealDossier";
import { Building2 } from "lucide-react";
import { HybridText, HybridSelect, DerivedRow } from "../HybridField";

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
        {/* Self-stated stage — verbatim picklist value from the form. Strongest single intent signal. */}
        {lead.brand === "SourceCo" && selfStated.value && (
          <DerivedRow label="Self-stated stage" derived={selfStated} />
        )}
        <HybridSelect
          label="Acq. timeline"
          manual={lead.acqTimeline}
          derived={timeline}
          options={TIMELINES}
          onSave={(v) => save({ acqTimeline: v })}
          allowEmpty
        />
        <HybridText
          label="Active searches"
          manual={lead.activeSearches}
          derived={sug.activeSearches?.value ? sug.activeSearches : activeSearchesSubmission}
          onSave={(v) => save({ activeSearches: v })}
        />
        <DerivedRow label="Stakeholders" derived={stakeholders} />
        <DerivedRow label="Champion" derived={champion} />
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
