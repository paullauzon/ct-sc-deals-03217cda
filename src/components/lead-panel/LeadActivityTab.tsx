import { Lead } from "@/types/lead";
import { UnifiedTimeline } from "@/components/dealroom/UnifiedTimeline";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, Sparkles } from "lucide-react";
import { logActivity } from "@/lib/activityLog";
import { toast } from "sonner";
import { StakeholderCard } from "./cards/StakeholderCard";
import { CompanyActivityCard } from "./cards/CompanyActivityCard";
import { useLeads } from "@/contexts/LeadContext";

interface Props {
  lead: Lead;
  save: (updates: Partial<Lead>) => void;
  onDraftFollowUp: () => void;
}

/** Inline action chips on the follow-up overdue banner */
function FollowUpActionBanner({ lead, save, onDraftFollowUp }: Props) {
  const today = new Date();
  const isClosed = ["Closed Won", "Lost", "Went Dark"].includes(lead.stage);
  if (isClosed) return null;

  let daysOverdue = 0;
  let label = "";
  if (!lead.nextFollowUp) {
    label = "No follow-up scheduled";
  } else {
    const d = new Date(lead.nextFollowUp);
    if (d < today) {
      daysOverdue = Math.floor((today.getTime() - d.getTime()) / 86400000);
      label = `Follow-up pending ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""}`;
    } else {
      return null;
    }
  }

  const markContacted = async () => {
    const today = new Date().toISOString().split("T")[0];
    save({ lastContactDate: today });
    await logActivity(lead.id, "field_update", `Marked contacted today`);
    toast.success("Marked contacted today");
  };

  const snooze = async (days: number) => {
    const next = new Date();
    next.setDate(next.getDate() + days);
    const iso = next.toISOString().split("T")[0];
    save({ nextFollowUp: iso });
    await logActivity(lead.id, "field_update", `Snoozed follow-up ${days}d → ${iso}`);
    toast.success(`Snoozed ${days} days`);
  };

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
        <span className="text-xs text-destructive font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1" onClick={markContacted}>
          <CalendarClock className="h-3 w-3" /> Mark contacted today
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => snooze(3)}>
          Snooze 3d
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => snooze(7)}>
          Snooze 7d
        </Button>
        <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1" onClick={onDraftFollowUp}>
          <Sparkles className="h-3 w-3" /> Draft follow-up
        </Button>
      </div>
    </div>
  );
}

export function LeadActivityTab({ lead, save, onDraftFollowUp }: Props) {
  const { leads } = useLeads();
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <FollowUpActionBanner lead={lead} save={save} onDraftFollowUp={onDraftFollowUp} />
      <UnifiedTimeline lead={lead} />
      <div className="mt-8 border-t border-border pt-2">
        <StakeholderCard lead={lead} />
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <CompanyActivityCard lead={lead} allLeads={leads} />
      </div>
    </div>
  );
}
