import { Lead } from "@/types/lead";
import { RightRailCards } from "@/components/dealroom/RightRailCards";
import { ForecastCard } from "@/components/lead-panel/cards/ForecastCard";

interface LeadPanelRightRailProps {
  lead: Lead;
  allLeads: Lead[];
  enriching: boolean;
  onEnrich: () => void;
  save: (updates: Partial<Lead>) => void;
}

export function LeadPanelRightRail({ lead, allLeads, save }: LeadPanelRightRailProps) {
  return (
    <aside className="w-[280px] shrink-0 border-l border-border overflow-y-auto bg-background h-full">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
      </div>
      <RightRailCards lead={lead} allLeads={allLeads} />
      <ForecastCard lead={lead} save={save} />
      <div className="h-6" />
    </aside>
  );
}
