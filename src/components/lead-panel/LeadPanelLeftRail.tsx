import { Lead, LeadStage, ServiceInterest, ForecastCategory, IcpFit, DealOwner, BillingFrequency, CloseReason } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { IdentityCard } from "@/components/dealroom/IdentityCard";
import { EmailMetricsCard } from "@/components/EmailMetricsCard";
import { Mail } from "lucide-react";
import { InlineTextField, InlineSelectField, InlineToggleField } from "./InlineEditFields";
import { MACriteriaCard } from "@/components/dealroom/KeyInformationCard";
import { Input } from "@/components/ui/input";

const STAGES: LeadStage[] = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent", "Revisit/Reconnect", "Lost", "Went Dark", "Closed Won"];
const SERVICES: ServiceInterest[] = ["Off-Market Email Origination", "Direct Calling", "Banker/Broker Coverage", "Full Platform (All 3)", "SourceCo Retained Search", "Other", "TBD"];
const PRIORITIES = ["High", "Medium", "Low"];
const OWNERS: DealOwner[] = ["Malik", "Valeria", "Tomos"];
const FORECASTS: ForecastCategory[] = ["Commit", "Best Case", "Pipeline", "Omit"];
const ICP_FITS: IcpFit[] = ["Strong", "Moderate", "Weak"];
const BILLING: BillingFrequency[] = ["Monthly", "Quarterly", "Annually"];
const CLOSE_REASONS: CloseReason[] = ["Budget", "Timing", "Competitor", "No Fit", "No Response", "Not Qualified", "Champion Left", "Other"];

interface Props {
  lead: Lead;
  daysInStage: number;
  save: (updates: Partial<Lead>) => void;
}

export function LeadPanelLeftRail({ lead, daysInStage, save }: Props) {
  const isSourceCo = lead.brand === "SourceCo";
  const isClosed = lead.stage === "Closed Won" || lead.stage === "Lost" || lead.stage === "Went Dark";

  return (
    <aside className="w-[300px] shrink-0 border-r border-border overflow-y-auto bg-background">
      <div className="px-4 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">About</span>
      </div>

      <IdentityCard lead={lead} />

      <div className="border-t border-border" />

      <CollapsibleCard title="Key Information" defaultOpen>
        <div className="space-y-0">
          <InlineSelectField label="Stage" value={lead.stage} options={STAGES} onSave={(v) => save({ stage: v as LeadStage, stageEnteredDate: new Date().toISOString().split("T")[0] })} />
          <InlineSelectField label="Priority" value={lead.priority} options={PRIORITIES} onSave={(v) => save({ priority: v as "High" | "Medium" | "Low" })} />
          <InlineSelectField label="Forecast" value={lead.forecastCategory} options={FORECASTS} onSave={(v) => save({ forecastCategory: v as ForecastCategory })} allowEmpty />
          <InlineSelectField label="ICP Fit" value={lead.icpFit} options={ICP_FITS} onSave={(v) => save({ icpFit: v as IcpFit })} allowEmpty />
          <InlineSelectField label="Owner" value={lead.assignedTo} options={OWNERS} onSave={(v) => save({ assignedTo: v as DealOwner })} allowEmpty />
          <InlineSelectField label="Service" value={lead.serviceInterest} options={SERVICES} onSave={(v) => save({ serviceInterest: v as ServiceInterest })} />
          <InlineTextField label="Deal Value" value={lead.dealValue} type="number" onSave={(v) => save({ dealValue: Number(v) || 0 })} />
          <InlineToggleField label="Pre-Screen" value={lead.preScreenCompleted} onSave={(v) => save({ preScreenCompleted: v })} onLabel="Done" offLabel="Pending" />
          <InlineTextField label="Subscription" value={lead.subscriptionValue} type="number" onSave={(v) => save({ subscriptionValue: Number(v) || 0 })} />
          <InlineSelectField label="Billing" value={lead.billingFrequency} options={BILLING} onSave={(v) => save({ billingFrequency: v as BillingFrequency })} allowEmpty />
          {lead.tier && (
            <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
              <span className="text-muted-foreground">Tier</span>
              <span className="font-medium">Tier {lead.tier}</span>
            </div>
          )}
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Dates" defaultOpen={false}>
        <div className="space-y-0">
          <InlineTextField label="Meeting" value={lead.meetingDate} type="date" onSave={(v) => save({ meetingDate: v })} />
          <InlineTextField label="Next Follow-up" value={lead.nextFollowUp} type="date" onSave={(v) => save({ nextFollowUp: v })} />
          <InlineTextField label="Last Contact" value={lead.lastContactDate} type="date" onSave={(v) => save({ lastContactDate: v })} />
          <InlineTextField label="Forecast Close" value={lead.forecastedCloseDate} type="date" onSave={(v) => save({ forecastedCloseDate: v })} />
          <InlineTextField label="Closed" value={lead.closedDate} type="date" onSave={(v) => save({ closedDate: v })} />
          <InlineTextField label="Contract Start" value={lead.contractStart} type="date" onSave={(v) => save({ contractStart: v })} />
          <InlineTextField label="Contract End" value={lead.contractEnd} type="date" onSave={(v) => save({ contractEnd: v })} />
          <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
            <span className="text-muted-foreground">Days in stage</span>
            <span className="font-medium">{daysInStage}d</span>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Email Activity" icon={<Mail className="h-3.5 w-3.5" />} defaultOpen={false}>
        <EmailMetricsCard leadId={lead.id} />
      </CollapsibleCard>

      {isSourceCo && (
        <CollapsibleCard title="M&A Criteria" defaultOpen={false}>
          <MACriteriaCard lead={lead} />
        </CollapsibleCard>
      )}

      {isClosed && (
        <CollapsibleCard title={lead.stage === "Closed Won" ? "Won Details" : "Lost / Dark Details"} defaultOpen>
          <div className="space-y-2">
            {lead.stage === "Closed Won" ? (
              <Input value={lead.wonReason} onChange={(e) => save({ wonReason: e.target.value })} placeholder="Why did we win?" className="h-8 text-xs" />
            ) : (
              <>
                <InlineSelectField label="Close Reason" value={lead.closeReason} options={CLOSE_REASONS} onSave={(v) => save({ closeReason: v as CloseReason })} allowEmpty />
                <Input value={lead.lostReason} onChange={(e) => save({ lostReason: e.target.value })} placeholder="Detail..." className="h-8 text-xs mt-1" />
              </>
            )}
          </div>
        </CollapsibleCard>
      )}

      {lead.message && (
        <CollapsibleCard title="Original Message" defaultOpen={false}>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {lead.message}
          </p>
        </CollapsibleCard>
      )}

      <div className="h-6" />
    </aside>
  );
}
