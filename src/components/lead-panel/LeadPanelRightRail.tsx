import { Lead } from "@/types/lead";
import { CollapsibleCard } from "@/components/dealroom/CollapsibleCard";
import { RightRailCards } from "@/components/dealroom/RightRailCards";
import { Building2, FileInput, Zap, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCompanyAssociates, getSharedIntelligence } from "@/lib/leadUtils";
import { SubmissionHistory } from "./shared";

interface LeadPanelRightRailProps {
  lead: Lead;
  allLeads: Lead[];
}

function CompanyActivityCard({ lead, allLeads }: { lead: Lead; allLeads: Lead[] }) {
  const associates = getCompanyAssociates(lead, allLeads);
  if (associates.length === 0) return null;
  const shared = getSharedIntelligence([lead, ...associates]);
  const trunc = (s: string) => s.length > 80 ? s.slice(0, 77) + "…" : s;

  return (
    <CollapsibleCard
      title={`Company · ${lead.company || "—"}`}
      icon={<Building2 className="h-3.5 w-3.5" />}
      count={associates.length + 1}
      defaultOpen
    >
      <p className="text-[11px] text-muted-foreground mb-2">
        {associates.length + 1} contacts · {shared.totalMeetings} meeting{shared.totalMeetings !== 1 ? "s" : ""}
      </p>
      <div className="space-y-1">
        {associates.map(a => (
          <div key={a.id} className="flex items-center justify-between text-xs border border-border/60 rounded px-2 py-1.5">
            <div className="min-w-0">
              <p className="font-medium truncate">{a.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{a.role}</p>
            </div>
            <Badge variant="outline" className="text-[9px] shrink-0 ml-1">{a.stage}</Badge>
          </div>
        ))}
      </div>
      {(shared.objections.length > 0 || shared.painPoints.length > 0) && (
        <div className="mt-2.5 pt-2 border-t border-border/40 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Shared Intelligence</p>
          {shared.objections.slice(0, 3).map((o, i) => (
            <p key={`o-${i}`} className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Zap className="h-3 w-3 shrink-0 mt-0.5" /> <span>{trunc(o)}</span>
            </p>
          ))}
          {shared.painPoints.slice(0, 3).map((p, i) => (
            <p key={`p-${i}`} className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Target className="h-3 w-3 shrink-0 mt-0.5" /> <span>{trunc(p)}</span>
            </p>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

export function LeadPanelRightRail({ lead, allLeads }: LeadPanelRightRailProps) {
  return (
    <aside className="w-[320px] shrink-0 border-l border-border overflow-y-auto bg-background">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Intelligence</span>
      </div>
      <RightRailCards lead={lead} allLeads={allLeads} />
      <CompanyActivityCard lead={lead} allLeads={allLeads} />
      {lead.submissions && lead.submissions.length > 1 && (
        <CollapsibleCard
          title="Submissions"
          icon={<FileInput className="h-3.5 w-3.5" />}
          count={lead.submissions.length}
          defaultOpen={false}
        >
          <SubmissionHistory submissions={lead.submissions} />
        </CollapsibleCard>
      )}
      <div className="h-6" />
    </aside>
  );
}
