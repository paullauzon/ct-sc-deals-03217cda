import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import { HybridText, type HybridSaveMeta } from "../HybridField";
import {
  deriveCompetingAgainst,
  deriveDecisionBlocker,
  deriveStallReason,
} from "@/lib/dealDossier";
import { Swords } from "lucide-react";
import { logActivity } from "@/lib/activityLog";

const SAMPLE_OUTCOMES = [
  "Awaiting feedback",
  "Positive — wants more",
  "Mixed — needs revisions",
  "Rejected — not relevant",
  "No response",
];

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
}

export function SalesProcessCard({ lead, save }: Props) {
  if (lead.brand !== "SourceCo") return null;

  const competing = deriveCompetingAgainst(lead);
  const blocker = deriveDecisionBlocker(lead);
  const stall = deriveStallReason(lead);

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
    <CollapsibleCard title="Sales Process" icon={<Swords className="h-3.5 w-3.5" />} defaultOpen>
      <div className="space-y-0">
        <HybridText
          label="Competing against"
          fieldKey="competingAgainst"
          manual={lead.competingAgainst}
          derived={competing}
          onSave={(v, meta) => saveWithLog({ competingAgainst: v }, meta)}
        />
        <HybridText
          label="Decision blocker"
          fieldKey="decisionBlocker"
          manual={lead.decisionBlocker}
          derived={blocker}
          onSave={(v, meta) => saveWithLog({ decisionBlocker: v }, meta)}
        />
        <InlineTextField
          label="Sample sent date"
          value={lead.sampleSentDate || ""}
          onSave={(v) => save({ sampleSentDate: v })}
          type="date"
        />
        <InlineSelectField
          label="Sample outcome"
          value={lead.sampleOutcome || ""}
          options={SAMPLE_OUTCOMES}
          onSave={(v) => save({ sampleOutcome: v })}
          allowEmpty
        />
        <InlineTextField
          label="Proof notes"
          value={lead.proofNotes || ""}
          onSave={(v) => save({ proofNotes: v })}
        />
        <HybridText
          label="Stall reason"
          fieldKey="stallReason"
          manual={lead.stallReason}
          derived={stall}
          onSave={(v, meta) => saveWithLog({ stallReason: v }, meta)}
        />
      </div>
    </CollapsibleCard>
  );
}
