import { Lead } from "@/types/lead";
import { ReactNode } from "react";

interface FieldRow {
  label: string;
  value: ReactNode;
}

function Row({ label, value }: FieldRow) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right truncate font-medium">
        {value || <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

export function KeyInformationCard({ lead }: { lead: Lead }) {
  return (
    <div className="space-y-0">
      <Row label="Stage" value={lead.stage} />
      <Row label="Priority" value={lead.priority} />
      <Row label="Forecast" value={lead.forecastCategory} />
      <Row label="ICP Fit" value={lead.icpFit} />
      <Row label="Owner" value={lead.assignedTo || "Unassigned"} />
      <Row label="Service" value={lead.serviceInterest} />
      <Row
        label="Deal Value"
        value={lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : null}
      />
      {lead.subscriptionValue > 0 && (
        <Row
          label="Subscription"
          value={`$${lead.subscriptionValue.toLocaleString()}${lead.billingFrequency ? ` ${lead.billingFrequency.toLowerCase()}` : ""}`}
        />
      )}
      {lead.tier && <Row label="Tier" value={`Tier ${lead.tier}`} />}
    </div>
  );
}

export function EngagementCard({ lead, daysInStage }: { lead: Lead; daysInStage: number }) {
  const meetingCount = lead.meetings?.length || 0;
  const submissionCount = lead.submissions?.length || 0;

  return (
    <div className="space-y-0">
      <Row label="Days in stage" value={`${daysInStage}d`} />
      <Row label="Last contact" value={lead.lastContactDate} />
      <Row label="Next follow-up" value={lead.nextFollowUp} />
      <Row label="Meetings" value={meetingCount > 0 ? meetingCount : null} />
      <Row label="Submissions" value={submissionCount > 0 ? submissionCount : null} />
    </div>
  );
}

export function MACriteriaCard({ lead }: { lead: Lead }) {
  return (
    <div className="space-y-0">
      <Row label="Target criteria" value={lead.targetCriteria} />
      <Row label="Target revenue" value={lead.targetRevenue} />
      <Row label="Geography" value={lead.geography} />
      <Row label="Acquisition strategy" value={lead.acquisitionStrategy} />
      <Row label="Buyer type" value={lead.buyerType} />
      <Row label="Deals planned" value={lead.dealsPlanned} />
    </div>
  );
}

export function DatesContractCard({ lead }: { lead: Lead }) {
  return (
    <div className="space-y-0">
      <Row label="Submitted" value={lead.dateSubmitted} />
      <Row label="Created" value={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : null} />
      {lead.meetingSetDate && <Row label="Meeting set" value={lead.meetingSetDate} />}
      {lead.meetingDate && <Row label="Meeting date" value={lead.meetingDate} />}
      {lead.closedDate && <Row label="Closed" value={lead.closedDate} />}
      {lead.contractStart && <Row label="Contract start" value={lead.contractStart} />}
      {lead.contractEnd && <Row label="Contract end" value={lead.contractEnd} />}
      {lead.forecastedCloseDate && <Row label="Forecast close" value={lead.forecastedCloseDate} />}
    </div>
  );
}
