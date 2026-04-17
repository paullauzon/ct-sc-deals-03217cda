import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { InlineTextField, InlineSelectField } from "../InlineEditFields";
import { TrendingUp } from "lucide-react";

const FORECAST_CATEGORIES = ["Commit", "Best Case", "Pipeline", "Omit"] as const;
const CONFIDENCE_OPTIONS = ["1 — Long shot", "2 — Unlikely", "3 — Possible", "4 — Likely", "5 — Locked"] as const;

const LATE_STAGES = new Set([
  "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Qualified",
]);

interface Props { lead: Lead; save: (updates: Partial<Lead>) => void; }

export function ForecastCard({ lead, save }: Props) {
  // Only surface the forecasting forcing-function for late-stage deals
  if (!LATE_STAGES.has(lead.stage)) return null;

  const fields = [
    !!lead.nextMutualStep?.trim(),
    !!lead.forecastedCloseDate?.trim(),
    lead.closeConfidence != null,
    !!lead.forecastCategory?.trim(),
  ];
  const filled = fields.filter(Boolean).length;

  const confidenceValue = lead.closeConfidence != null
    ? CONFIDENCE_OPTIONS[Math.min(Math.max(lead.closeConfidence, 1), 5) - 1] || ""
    : "";

  return (
    <CollapsibleCard
      title="Forecast"
      icon={<TrendingUp className="h-3.5 w-3.5" />}
      count={`${filled}/4`}
      defaultOpen={filled < 4}
      smallCapsTitle
    >
      {filled === 0 && (
        <p className="text-[10px] text-muted-foreground mb-1.5 italic">
          Forecast not set — needed for pipeline reporting.
        </p>
      )}
      <div className="space-y-0">
        <InlineTextField
          label="Next mutual step"
          value={lead.nextMutualStep || ""}
          onSave={(v) => save({ nextMutualStep: v })}
          placeholder="e.g. Send proposal Tue"
        />
        <InlineTextField
          label="Forecasted close"
          value={lead.forecastedCloseDate || ""}
          onSave={(v) => save({ forecastedCloseDate: v })}
          type="date"
        />
        <InlineSelectField
          label="Confidence"
          value={confidenceValue}
          options={CONFIDENCE_OPTIONS as unknown as string[]}
          onSave={(v) => {
            if (!v) { save({ closeConfidence: null }); return; }
            const n = parseInt(v.charAt(0), 10);
            save({ closeConfidence: Number.isFinite(n) ? n : null });
          }}
          allowEmpty
        />
        <InlineSelectField
          label="Category"
          value={lead.forecastCategory || ""}
          options={FORECAST_CATEGORIES as unknown as string[]}
          onSave={(v) => save({ forecastCategory: v as any })}
          allowEmpty
        />
      </div>
    </CollapsibleCard>
  );
}
