import { useState, useMemo, useCallback } from "react";
import { useLeads } from "@/contexts/LeadContext";
import { Lead } from "@/types/lead";
import { computeDaysInStage } from "@/lib/leadUtils";
import { LeadDetail } from "@/components/LeadsTable";
import { Clock, CalendarDays, AlertTriangle, UserPlus, FileWarning, Filter } from "lucide-react";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const OWNERS = ["All", "Malik", "Valeria", "Tomos", "Unassigned"] as const;

interface ActionItem {
  lead: Lead;
  type: "overdue" | "meeting" | "dark" | "untouched" | "renewal" | "stale";
  label: string;
  detail: string;
  urgency: number; // higher = more urgent
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
        // Check contract renewals for won deals
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

      // Overdue follow-ups
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

      // Meetings today/this week
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

      // Went dark recently (within 7d of last contact, in "Contacted" or later but no activity)
      const daysSinceContact = lead.lastContactDate
        ? Math.floor((now.getTime() - new Date(lead.lastContactDate).getTime()) / 86400000)
        : 999;
      if (daysSinceContact > 21 && !["New Lead"].includes(lead.stage)) {
        actions.push({
          lead, type: "dark",
          label: `No contact in ${daysSinceContact}d`,
          detail: `${lead.company} · ${lead.stage} · $${lead.dealValue.toLocaleString()}`,
          urgency: 50 + daysSinceContact,
        });
      }

      // New leads not yet touched
      if (lead.stage === "New Lead" && !lead.lastContactDate && !lead.assignedTo) {
        const daysOld = Math.floor((now.getTime() - new Date(lead.dateSubmitted).getTime()) / 86400000);
        actions.push({
          lead, type: "untouched",
          label: `Untouched new lead (${daysOld}d old)`,
          detail: `${lead.company} · ${lead.source}`,
          urgency: 80 + daysOld,
        });
      }

      // Stale deals (>14d in stage)
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

  const typeConfig: Record<ActionItem["type"], { icon: typeof Clock; color: string; bg: string }> = {
    overdue: { icon: Clock, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30" },
    meeting: { icon: CalendarDays, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
    dark: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
    untouched: { icon: UserPlus, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
    renewal: { icon: FileWarning, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
    stale: { icon: Clock, color: "text-muted-foreground", bg: "bg-secondary" },
  };

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {items.length} action items across your pipeline
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
            const cfg = typeConfig[type];
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${typeFilter === type ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary"}`}
              >
                {type === "overdue" ? "🔴 Overdue" :
                 type === "meeting" ? "📅 Meetings" :
                 type === "dark" ? "⚠️ Going Dark" :
                 type === "untouched" ? "🆕 Untouched" :
                 type === "renewal" ? "📋 Renewals" :
                 "⏳ Stale"} ({count})
              </button>
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
            <p className="text-sm text-muted-foreground">✓ No action items — you're all caught up!</p>
          </div>
        ) : (
          filteredItems.map((item, i) => {
            const cfg = typeConfig[item.type];
            const Icon = cfg.icon;
            return (
              <div
                key={`${item.lead.id}-${item.type}-${i}`}
                onClick={() => setSelectedLeadId(item.lead.id)}
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1 py-0.5 border border-border rounded">
                      {item.lead.brand === "Captarget" ? "CT" : "SC"}
                    </span>
                    <span className="text-sm font-medium">{item.lead.name}</span>
                    {item.lead.assignedTo && (
                      <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">
                        {item.lead.assignedTo[0]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-medium ${cfg.color}`}>{item.label}</p>
                  {item.lead.dealValue > 0 && (
                    <p className="text-xs text-muted-foreground tabular-nums">${item.lead.dealValue.toLocaleString()}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <LeadDetail leadId={selectedLeadId} open={!!selectedLeadId} onClose={() => setSelectedLeadId(null)} />
    </div>
  );
}
