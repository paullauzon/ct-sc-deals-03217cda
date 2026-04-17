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
import { HybridText, HybridSelect, DerivedRow, type HybridSaveMeta } from "../HybridField";
import { logActivity } from "@/lib/activityLog";

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

  // Wrap save() so HybridField's confirm meta produces an audit-log entry.
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
    <CollapsibleCard title="Buyer Profile" icon={<Building2 className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-0">
        <HybridSelect
          label="Firm type"
          fieldKey="buyerType"
          manual={lead.buyerType}
          derived={firmTypeSubmission}
          options={FIRM_TYPES}
          onSave={(v, meta) => saveWithLog({ buyerType: v }, meta)}
          allowEmpty
        />
        <HybridText
          label="Firm AUM"
          fieldKey="firmAum"
          manual={lead.firmAum}
          derived={sug.firmAum || { value: "", source: "" }}
          onSave={(v, meta) => saveWithLog({ firmAum: v }, meta)}
        />
        {lead.brand === "SourceCo" && selfStated.value && (
          <DerivedRow label="Self-stated stage" derived={selfStated} fieldKey="selfStatedStage" />
        )}
        <HybridSelect
          label="Acq. timeline"
          fieldKey="acqTimeline"
          manual={lead.acqTimeline}
          derived={timeline}
          options={TIMELINES}
          onSave={(v, meta) => saveWithLog({ acqTimeline: v }, meta)}
          allowEmpty
        />
        <HybridText
          label="Active searches"
          fieldKey="activeSearches"
          manual={lead.activeSearches}
          derived={sug.activeSearches?.value ? sug.activeSearches : activeSearchesSubmission}
          onSave={(v, meta) => saveWithLog({ activeSearches: v }, meta)}
        />
        <DerivedRow label="Stakeholders" derived={stakeholders} fieldKey="stakeholders" />
        <DerivedRow label="Champion" derived={champion} fieldKey="champion" />
        <HybridSelect
          label="Budget confirmed"
          fieldKey="budgetConfirmed"
          manual={lead.budgetConfirmed}
          derived={budget}
          options={YES_NO_UNCLEAR}
          onSave={(v, meta) => saveWithLog({ budgetConfirmed: v }, meta)}
          allowEmpty
        />
        <HybridText
          label="Authority confirmed"
          fieldKey="authorityConfirmed"
          manual={lead.authorityConfirmed}
          derived={
            sug.authorityConfirmed && sug.authorityConfirmed.value
              ? sug.authorityConfirmed
              : authority
          }
          onSave={(v, meta) => saveWithLog({ authorityConfirmed: v }, meta)}
        />
      </div>
    </CollapsibleCard>
  );
}
