import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { IdentityCard } from "@/components/dealroom/IdentityCard";
import { KeyInformationCard, EngagementCard, MACriteriaCard, DatesContractCard } from "@/components/dealroom/KeyInformationCard";
import { EmailMetricsCard } from "@/components/EmailMetricsCard";
import { Mail } from "lucide-react";

interface LeadPanelLeftRailProps {
  lead: Lead;
  daysInStage: number;
}

export function LeadPanelLeftRail({ lead, daysInStage }: LeadPanelLeftRailProps) {
  const isSourceCo = lead.brand === "SourceCo";
  return (
    <aside className="w-[300px] shrink-0 border-r border-border overflow-y-auto bg-background">
      <div className="px-4 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">About</span>
      </div>

      <IdentityCard lead={lead} />

      <div className="border-t border-border" />

      <CollapsibleCard title="Key Information" defaultOpen>
        <KeyInformationCard lead={lead} />
      </CollapsibleCard>

      <CollapsibleCard title="Email Activity" icon={<Mail className="h-3.5 w-3.5" />} defaultOpen>
        <EmailMetricsCard leadId={lead.id} />
      </CollapsibleCard>

      <CollapsibleCard title="Engagement" defaultOpen>
        <EngagementCard lead={lead} daysInStage={daysInStage} />
      </CollapsibleCard>

      {isSourceCo && (
        <CollapsibleCard title="M&A Criteria" defaultOpen={false}>
          <MACriteriaCard lead={lead} />
        </CollapsibleCard>
      )}

      <CollapsibleCard title="Dates & Contract" defaultOpen={false}>
        <DatesContractCard lead={lead} />
      </CollapsibleCard>

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
