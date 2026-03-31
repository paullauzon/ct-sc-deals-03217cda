import { useState, useMemo } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { LeadDetail } from "@/components/LeadsTable";
import { Filter } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandLogo } from "@/components/BrandLogo";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const OWNERS = ["All", "Malik", "Valeria", "Tomos", "Unassigned"] as const;

interface ActionItem {
  lead: Lead;
  type: "overdue" | "meeting" | "dark" | "untouched" | "renewal" | "stale";
  label: string;
  detail: string;
  urgency: number;
}

const TYPE_LABELS: Record<ActionItem["type"], string> = {
  overdue: "Overdue",
  meeting: "Meetings",
  dark: "Going Dark",
  untouched: "Untouched",
  renewal: "Renewals",
  stale: "Stale",
};

const TYPE_DESCRIPTIONS: Record<ActionItem["type"], string> = {
  overdue: "Follow-up date has passed",
  meeting: "Meeting scheduled within 7 days",
  dark: "No contact in 21+ days (active deals)",
  untouched: "New leads with no owner or contact",
  renewal: "Contracts expiring within 30 days",
  stale: "Stuck in same stage for 14+ days",
};

const TYPE_BORDER_COLORS: Record<ActionItem["type"], string> = {
  overdue: "border-l-red-500 dark:border-l-red-400",
  meeting: "border-l-blue-500 dark:border-l-blue-400",
  dark: "border-l-amber-500 dark:border-l-amber-400",
  untouched: "border-l-emerald-500 dark:border-l-emerald-400",
  renewal: "border-l-purple-500 dark:border-l-purple-400",
  stale: "border-l-muted-foreground/40",
};

const TYPE_TEXT_COLORS: Record<ActionItem["type"], string> = {
  overdue: "text-red-600 dark:text-red-400",
  meeting: "text-blue-600 dark:text-blue-400",
  dark: "text-amber-600 dark:text-amber-400",
  untouched: "text-emerald-600 dark:text-emerald-400",
  renewal: "text-purple-600 dark:text-purple-400",
  stale: "text-muted-foreground",
};

/** Best available "last contact" date for a lead, with fallbacks */
function getEffectiveContactDate(lead: Lead): string {
  return lead.lastContactDate || lead.meetingDate || lead.stageEnteredDate || lead.dateSubmitted || "";
}

export function ActionQueue() {
  const { leads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("All");

  const items = useMemo(() => {
    const now = new Date();
    const actions: ActionItem[] = [];
    const filteredLeads = ownerFilter === "All"
      ? leads
      : ownerFilter === "Unassigned"
        ? leads.filter(l => !l.assignedTo)
        : leads.filter(l => l.assignedTo === ownerFilter);

    for (const lead of filteredLeads) {
      if (CLOSED_STAGES.has(lead.stage)) {
        if (lead.stage === "Closed Won" && lead.contractEnd) {
          const end = new Date(lead.contractEnd);
          const daysUntil = Math.floor((end.getTime() - now.getTime()) / 86400000);
          if (daysUntil >= 0 && daysUntil <= 30) {
            actions.push({
              lead, type: "renewal",
              label: `Contract expires in ${daysUntil}d`,
              detail: `${lead.company} · $${(lead.subscriptionValue || 0).toLocaleString()}`,
              urgency: 100 - daysUntil,
            });
          }
        }
        continue;
      }

      if (lead.nextFollowUp) {
        const followUp = new Date(lead.nextFollowUp);
        if (followUp < now) {
          const daysOverdue = Math.floor((now.getTime() - followUp.getTime()) / 86400000);
          actions.push({
            lead, type: "overdue",
            label: `Follow-up ${daysOverdue}d overdue`,
            detail: `${lead.company} · ${lead.stage} · $${lead.dealValue.toLocaleString()}`,
            urgency: 200 + daysOverdue,
          });
        }
      }

      if (lead.meetingDate) {
        const meetDate = new Date(lead.meetingDate);
        const daysUntil = Math.floor((meetDate.getTime() - now.getTime()) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 7) {
          actions.push({
            lead, type: "meeting",
            label: daysUntil === 0 ? "Meeting TODAY" : `Meeting in ${daysUntil}d`,
            detail: `${lead.company} · ${lead.stage}`,
            urgency: 150 + (7 - daysUntil) * 10,
          });
        }
      }

      // "Going Dark" — use effective contact date with fallbacks
      const effectiveDate = getEffectiveContactDate(lead);
      const daysSinceContact = effectiveDate
        ? Math.floor((now.getTime() - new Date(effectiveDate).getTime()) / 86400000)
        : null;
      if (daysSinceContact !== null && daysSinceContact > 21 && !["New Lead"].includes(lead.stage)) {
        actions.push({
          lead, type: "dark",
          label: `No contact in ${daysSinceContact}d`,
          detail: `${lead.company} · ${lead.stage} · $${lead.dealValue.toLocaleString()}`,
          urgency: 50 + daysSinceContact,
        });
      }

      if (lead.stage === "New Lead" && !lead.lastContactDate && !lead.assignedTo) {
        const daysOld = Math.floor((now.getTime() - new Date(lead.dateSubmitted).getTime()) / 86400000);
        actions.push({
          lead, type: "untouched",
          label: `Untouched new lead (${daysOld}d old)`,
          detail: `${lead.company} · ${lead.source}`,
          urgency: 80 + daysOld,
        });
      }

      const daysInStage = computeDaysInStage(lead.stageEnteredDate);
      if (daysInStage > 14 && !["New Lead"].includes(lead.stage)) {
        actions.push({
          lead, type: "stale",
          label: `${daysInStage}d in ${lead.stage}`,
          detail: `${lead.company} · $${lead.dealValue.toLocaleString()}`,
          urgency: 30 + daysInStage,
        });
      }
    }

    return actions.sort((a, b) => b.urgency - a.urgency);
  }, [leads, ownerFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    return counts;
  }, [items]);

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const filteredItems = typeFilter ? items.filter(i => i.type === typeFilter) : items;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Action Queue</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Leads that need your attention — overdue tasks, upcoming meetings, and pipeline risks
            <span className="ml-1 tabular-nums">({items.length} items)</span>
          </p>
        </div>

        {/* Summary chips + owner filter */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${!typeFilter ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}
            >
              All ({items.length})
            </button>
            {(["overdue", "meeting", "dark", "untouched", "renewal", "stale"] as const).map(type => {
              const count = typeCounts[type] || 0;
              if (count === 0) return null;
              return (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${typeFilter === type ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}
                    >
                      {TYPE_LABELS[type]} ({count})
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{TYPE_DESCRIPTIONS[type]}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1 bg-background"
            >
              {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* Action Items List */}
        <div className="border border-border rounded-md divide-y divide-border">
          {filteredItems.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">No action items — you're all caught up</p>
            </div>
          ) : (
            filteredItems.map((item, i) => {
              const borderColor = TYPE_BORDER_COLORS[item.type];
              const textColor = TYPE_TEXT_COLORS[item.type];
              return (
                <div
                  key={`${item.lead.id}-${item.type}-${i}`}
                  onClick={() => setSelectedLeadId(item.lead.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-secondary/30 transition-colors border-l-[3px] ${borderColor}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <BrandLogo brand={item.lead.brand} size="xs" />
                      <span className="text-sm font-medium">{item.lead.name}</span>
                      {item.lead.assignedTo && (
                        <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-semibold shrink-0">
                          {item.lead.assignedTo[0]}
                        </span>
                      )}
                      <span className={`text-xs font-medium ml-auto ${textColor}`}>
                        {item.label}
                        {item.lead.dealValue > 0 && <span className="text-muted-foreground font-normal ml-2 tabular-nums">${item.lead.dealValue.toLocaleString()}</span>}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      </div>
    </TooltipProvider>
  );
}
