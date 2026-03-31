import { useState, useMemo, useRef } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { LeadDetail } from "@/components/LeadsTable";
import { Filter, CalendarCheck, ChevronDown, ChevronRight } from "lucide-react";
import { getBrandBorderClass } from "@/lib/brandColors";
import { BrandLogo } from "@/components/BrandLogo";
import { format } from "date-fns";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const OWNERS = ["All", "Malik", "Valeria", "Tomos", "Unassigned"] as const;

interface ActionItem {
  lead: Lead;
  type: "overdue" | "meeting" | "dark" | "untouched" | "renewal" | "stale";
  label: string;
  detail: string;
  urgency: number;
}

type PriorityTier = "urgent" | "at-risk" | "monitor";

const TIER_CONFIG: Record<PriorityTier, { label: string; types: ActionItem["type"][]; colorClass: string; dotClass: string }> = {
  urgent: {
    label: "Urgent",
    types: ["overdue", "renewal"],
    colorClass: "text-red-600 dark:text-red-400",
    dotClass: "bg-red-500",
  },
  "at-risk": {
    label: "At Risk",
    types: ["dark", "untouched"],
    colorClass: "text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-500",
  },
  monitor: {
    label: "Monitor",
    types: ["stale"],
    colorClass: "text-muted-foreground",
    dotClass: "bg-muted-foreground/40",
  },
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

function getEffectiveContactDate(lead: Lead): string {
  return lead.lastContactDate || lead.meetingDate || lead.stageEnteredDate || lead.dateSubmitted || "";
}

function buildActionItems(leads: Lead[], ownerFilter: string, meetingHorizon: number = 14): ActionItem[] {
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
            label: `Expires in ${daysUntil}d`,
            detail: `$${(lead.subscriptionValue || 0).toLocaleString()}`,
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
          label: `${daysOverdue}d overdue`,
          detail: lead.stage,
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
          label: daysUntil === 0 ? "TODAY" : `in ${daysUntil}d`,
          detail: lead.stage,
          urgency: 150 + (7 - daysUntil) * 10,
        });
      }
    }

    const effectiveDate = getEffectiveContactDate(lead);
    const daysSinceContact = effectiveDate
      ? Math.floor((now.getTime() - new Date(effectiveDate).getTime()) / 86400000)
      : null;
    if (daysSinceContact !== null && daysSinceContact > 21 && !["New Lead"].includes(lead.stage)) {
      actions.push({
        lead, type: "dark",
        label: `Silent ${daysSinceContact}d`,
        detail: lead.stage,
        urgency: 50 + daysSinceContact,
      });
    }

    if (lead.stage === "New Lead" && !lead.lastContactDate && !lead.assignedTo) {
      const daysOld = Math.floor((now.getTime() - new Date(lead.dateSubmitted).getTime()) / 86400000);
      actions.push({
        lead, type: "untouched",
        label: `${daysOld}d untouched`,
        detail: lead.source,
        urgency: 80 + daysOld,
      });
    }

    const daysInStage = computeDaysInStage(lead.stageEnteredDate);
    if (daysInStage > 14 && !["New Lead"].includes(lead.stage)) {
      actions.push({
        lead, type: "stale",
        label: `${daysInStage}d in stage`,
        detail: lead.stage,
        urgency: 30 + daysInStage,
      });
    }
  }

  return actions.sort((a, b) => b.urgency - a.urgency);
}

/* ─── Meeting Card ─── */
function MeetingCard({ item, onClick }: { item: ActionItem; onClick: () => void }) {
  const lead = item.lead;
  const isToday = item.label === "TODAY";
  const meetTime = lead.meetingDate ? format(new Date(lead.meetingDate), "h:mm a") : "";

  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 w-[260px] border border-border rounded-lg p-3 cursor-pointer hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="relative">
          <CalendarCheck className="h-3.5 w-3.5 text-blue-500" />
          {isToday && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
          {isToday ? "Today" : item.label}
        </span>
        {meetTime && (
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{meetTime}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <BrandLogo brand={lead.brand} size="xxs" />
        <span className="text-sm font-medium truncate">{lead.name}</span>
        {lead.assignedTo && (
          <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0 ml-auto">
            {lead.assignedTo[0]}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 truncate">
        {lead.company}
        {lead.calendlyEventName && ` · ${lead.calendlyEventName}`}
        {lead.calendlyEventDuration && ` · ${lead.calendlyEventDuration}m`}
      </p>
    </div>
  );
}

/* ─── Action Row ─── */
function ActionRow({ item, onClick }: { item: ActionItem; onClick: () => void }) {
  const borderColor = TYPE_BORDER_COLORS[item.type];
  const textColor = TYPE_TEXT_COLORS[item.type];

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-secondary/30 transition-colors border-l-[3px] ${borderColor}`}
    >
      <BrandLogo brand={item.lead.brand} size="xxs" />
      <span className="text-sm font-medium truncate min-w-0">{item.lead.name}</span>
      <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{item.lead.company}</span>
      {item.lead.assignedTo && (
        <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">
          {item.lead.assignedTo[0]}
        </span>
      )}
      <span className={`text-xs font-medium ml-auto whitespace-nowrap ${textColor}`}>
        {item.label}
      </span>
      {item.lead.dealValue > 0 && (
        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
          ${item.lead.dealValue.toLocaleString()}
        </span>
      )}
    </div>
  );
}

/* ─── Collapsible Tier ─── */
function TierSection({
  tier,
  items,
  onSelect,
}: {
  tier: PriorityTier;
  items: ActionItem[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const config = TIER_CONFIG[tier];
  const totalValue = items.reduce((sum, i) => sum + (i.lead.dealValue || 0), 0);

  if (items.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${config.dotClass}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${config.colorClass}`}>
          {config.label}
        </span>
        <span className="text-[10px] text-muted-foreground">({items.length})</span>
        {totalValue > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
            ${totalValue.toLocaleString()}
          </span>
        )}
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
        )}
      </button>
      {open && (
        <div className="divide-y divide-border">
          {items.map((item, i) => (
            <ActionRow
              key={`${item.lead.id}-${item.type}-${i}`}
              item={item}
              onClick={() => onSelect(item.lead.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export function ActionQueue() {
  const { leads } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("All");

  const items = useMemo(() => buildActionItems(leads, ownerFilter), [leads, ownerFilter]);

  const meetings = useMemo(() => items.filter(i => i.type === "meeting"), [items]);
  const tierItems = useMemo(() => {
    const nonMeeting = items.filter(i => i.type !== "meeting");
    return {
      urgent: nonMeeting.filter(i => TIER_CONFIG.urgent.types.includes(i.type)),
      "at-risk": nonMeeting.filter(i => TIER_CONFIG["at-risk"].types.includes(i.type)),
      monitor: nonMeeting.filter(i => TIER_CONFIG.monitor.types.includes(i.type)),
    };
  }, [items]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
    return counts;
  }, [items]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Action Queue</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {items.length} items needing attention
          </p>
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

      {/* Summary Stats */}
      <div className="flex gap-3 flex-wrap text-[11px] text-muted-foreground">
        {(["overdue", "meeting", "dark", "untouched", "renewal", "stale"] as const).map(type => {
          const count = typeCounts[type] || 0;
          if (count === 0) return null;
          const labels: Record<string, string> = {
            overdue: "Overdue", meeting: "Meetings", dark: "Going Dark",
            untouched: "Untouched", renewal: "Renewals", stale: "Stale",
          };
          return (
            <span key={type} className="tabular-nums">
              <span className="font-medium text-foreground">{count}</span>{" "}{labels[type]}
            </span>
          );
        })}
      </div>

      {/* Meetings Hero Section */}
      {meetings.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CalendarCheck className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Upcoming Meetings
            </span>
            <span className="text-[10px] text-muted-foreground">({meetings.length})</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {meetings.map((item, i) => (
              <MeetingCard
                key={`meeting-${item.lead.id}-${i}`}
                item={item}
                onClick={() => setSelectedLeadId(item.lead.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Priority Tiers */}
      <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
        {(["urgent", "at-risk", "monitor"] as PriorityTier[]).map(tier => (
          <TierSection
            key={tier}
            tier={tier}
            items={tierItems[tier]}
            onSelect={setSelectedLeadId}
          />
        ))}
        {items.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">No action items — you're all caught up</p>
          </div>
        )}
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
