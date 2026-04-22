import { Lead } from "@/types/lead";
import { RightRailCards } from "@/components/dealroom/RightRailCards";
import { ForecastCard } from "@/components/lead-panel/cards/ForecastCard";
import { LinkedAccountCard } from "@/components/lead-panel/cards/LinkedAccountCard";
import { DealSnapshotCard } from "@/components/lead-panel/cards/DealSnapshotCard";
import { PipelineStagesCard } from "@/components/lead-panel/cards/PipelineStagesCard";
import { AssociatedCompanyCard } from "@/components/lead-panel/cards/AssociatedCompanyCard";
import { OpenTasksCard } from "@/components/lead-panel/cards/OpenTasksCard";
import { SignalsCard } from "@/components/lead-panel/cards/SignalsCard";
import { StakeholderCard } from "@/components/lead-panel/cards/StakeholderCard";
import { FirefliesRecordingsCard } from "@/components/lead-panel/cards/FirefliesRecordingsCard";
import { AttachmentsCard } from "@/components/lead-panel/cards/AttachmentsCard";
import { SequenceCard } from "@/components/lead-panel/cards/SequenceCard";
import { FirmActivityCard } from "@/components/dealroom/FirmActivityCard";

interface LeadPanelRightRailProps {
  lead: Lead;
  allLeads: Lead[];
  daysInStage: number;
  enriching: boolean;
  onEnrich: () => void;
  onTask: () => void;
  save: (updates: Partial<Lead>) => void;
}

export function LeadPanelRightRail({ lead, allLeads, daysInStage, save, onTask }: LeadPanelRightRailProps) {
  return (
    <aside className="w-[320px] shrink-0 border-l border-border overflow-y-auto bg-background h-full">
      {/* Top: at-a-glance deal summary */}
      <DealSnapshotCard lead={lead} daysInStage={daysInStage} save={save} />
      <PipelineStagesCard lead={lead} />

      {/* Mid: collapsed-by-default health/signals/tasks */}
      <RightRailCards lead={lead} allLeads={allLeads} />
      <SignalsCard lead={lead} />
      <SequenceCard lead={lead} />
      <OpenTasksCard lead={lead} onAddTask={onTask} />

      {/* Lower: company + people + artifacts */}
      <AssociatedCompanyCard lead={lead} />
      <FirmActivityCard lead={lead} />
      <StakeholderCard lead={lead} />
      <FirefliesRecordingsCard lead={lead} />
      <AttachmentsCard lead={lead} />

      {/* Forecast + handoff (Closed Won only) */}
      <ForecastCard lead={lead} save={save} />
      <LinkedAccountCard lead={lead} />

      <div className="h-6" />
    </aside>
  );
}
