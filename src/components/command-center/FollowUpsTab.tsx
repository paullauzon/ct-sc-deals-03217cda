import { useState, useMemo, useEffect } from "react";
import { Lead } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { BrandLogo } from "@/components/BrandLogo";
import {
  ChevronDown, ChevronRight, Clock, AlertTriangle, UserX, Ghost,
  Mail, Mic, CalendarCheck, ArrowUpDown, Zap
} from "lucide-react";
import { format, parseISO, differenceInDays, isToday, addDays, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const STAGE_OPTIONS = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

type SortField = "default" | "dealValue" | "lastContact" | "stage" | "name";
type SortDir = "asc" | "desc";

// ─── Sort bar ───
function SortBar({ sortField, sortDir, onSort }: { sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void }) {
  const buttons: { field: SortField; label: string }[] = [
    { field: "default", label: "Priority" },
    { field: "dealValue", label: "Value" },
    { field: "lastContact", label: "Last Contact" },
    { field: "stage", label: "Stage" },
    { field: "name", label: "Name" },
  ];
  return (
    <div className="flex items-center gap-1 mb-3">
      <ArrowUpDown className="h-3 w-3 text-muted-foreground mr-1" />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Sort</span>
      {buttons.map(b => (
        <button
          key={b.field}
          onClick={() => onSort(b.field)}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
            sortField === b.field
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/50"
          )}
        >
          {b.label}{sortField === b.field ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      ))}
    </div>
  );
}

// ─── Section header ───
function SectionHeader({
  title, count, dotColor, open, onToggle,
}: {
  title: string; count: number; dotColor: string; open: boolean; onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-secondary/30 transition-colors">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">{title}</span>
      <span className="text-[10px] text-muted-foreground">({count})</span>
      {open ? <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" /> : <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />}
    </button>
  );
}

// ─── Get recommended action ───
function getRecommendation(lead: Lead): string | null {
  const di = lead.dealIntelligence;
  if (di?.actionItemTracker) {
    const open = di.actionItemTracker.find(a => a.status === "Open" || a.status === "Overdue");
    if (open) return `Action: ${open.item}`;
  }
  const su = lead.enrichment?.suggestedUpdates;
  if (su?.nextFollowUp) return `AI: follow up by ${su.nextFollowUp.value}`;
  if (lead.meetings.length > 0 && lead.stage === "Meeting Held") return "Consider advancing stage →";
  return null;
}

// ─── Rich row ───
function FollowUpRow({
  lead, label, onSelect, emailCount, onUpdate,
}: {
  lead: Lead; label: string; onSelect: (id: string) => void;
  emailCount: number;
  onUpdate: (id: string, data: Partial<Lead>) => void;
}) {
  const now = new Date();
  const meetingCount = lead.meetings?.length || 0;
  const hasCalendly = !!lead.calendlyBookedAt;
  const recommendation = getRecommendation(lead);
  const lastContact = lead.lastContactDate
    ? (() => { try { return format(parseISO(lead.lastContactDate), "MMM d"); } catch { return "—"; } })()
    : null;

  return (
    <div className="px-4 py-2.5 hover:bg-secondary/20 transition-colors cursor-pointer group" onClick={() => onSelect(lead.id)}>
      {/* Line 1: Identity */}
      <div className="flex items-center gap-2 min-w-0">
        <BrandLogo brand={lead.brand} size="xxs" />
        <span className="text-sm font-medium truncate">{lead.name}</span>
        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{lead.company}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hidden md:inline shrink-0">{lead.stage}</span>
        {lead.assignedTo && (
          <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">{lead.assignedTo[0]}</span>
        )}
        <span className="text-xs font-medium ml-auto whitespace-nowrap text-foreground">{label}</span>
      </div>

      {/* Line 2: Context signals */}
      <div className="flex items-center gap-3 mt-1 pl-6 min-w-0">
        {lead.dealValue > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">${lead.dealValue.toLocaleString()}</span>
        )}
        {lastContact && (
          <span className="text-[10px] text-muted-foreground">Last: {lastContact}</span>
        )}
        {meetingCount > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Mic className="h-2.5 w-2.5" />{meetingCount}
          </span>
        )}
        {emailCount > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Mail className="h-2.5 w-2.5" />{emailCount}
          </span>
        )}
        {hasCalendly && (
          <CalendarCheck className="h-2.5 w-2.5 text-muted-foreground" />
        )}

        {/* Quick action: Next Step */}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-[9px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:bg-foreground hover:text-background transition-colors flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" /> Next Step
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Follow-up Date</p>
                  <Calendar
                    mode="single"
                    selected={undefined}
                    onSelect={(date) => { if (date) onUpdate(lead.id, { nextFollowUp: format(date, "yyyy-MM-dd") }); }}
                    className={cn("p-2 pointer-events-auto")}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Advance Stage</p>
                  <Select onValueChange={(val) => onUpdate(lead.id, { stage: val as Lead["stage"], stageEnteredDate: format(new Date(), "yyyy-MM-dd") })}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={lead.stage} />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  onClick={() => onUpdate(lead.id, { lastContactDate: format(new Date(), "yyyy-MM-dd") })}
                  className="w-full text-xs py-1.5 rounded border border-border text-muted-foreground hover:bg-foreground hover:text-background transition-colors"
                >
                  Mark Contacted Today
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Line 3: AI recommendation */}
      {recommendation && (
        <p className="text-[10px] text-muted-foreground italic pl-6 mt-0.5 truncate">{recommendation}</p>
      )}
    </div>
  );
}

// ─── Sorting utility ───
function applySortToLeads<T extends { lead: Lead }>(items: T[], sortField: SortField, sortDir: SortDir, defaultSort: (a: T, b: T) => number): T[] {
  if (sortField === "default") {
    return [...items].sort((a, b) => sortDir === "asc" ? defaultSort(a, b) : defaultSort(b, a));
  }
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "dealValue": cmp = a.lead.dealValue - b.lead.dealValue; break;
      case "lastContact": {
        const aDate = a.lead.lastContactDate ? new Date(a.lead.lastContactDate).getTime() : 0;
        const bDate = b.lead.lastContactDate ? new Date(b.lead.lastContactDate).getTime() : 0;
        cmp = aDate - bDate; break;
      }
      case "stage": cmp = a.lead.stage.localeCompare(b.lead.stage); break;
      case "name": cmp = a.lead.name.localeCompare(b.lead.name); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
}

function applySortToLeadsDirect(items: Lead[], sortField: SortField, sortDir: SortDir): Lead[] {
  if (sortField === "default") return items;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "dealValue": cmp = a.dealValue - b.dealValue; break;
      case "lastContact": {
        const aDate = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
        const bDate = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
        cmp = aDate - bDate; break;
      }
      case "stage": cmp = a.stage.localeCompare(b.stage); break;
      case "name": cmp = a.name.localeCompare(b.name); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
}

// ─── Main component ───
export function FollowUpsTab({ leads, ownerFilter, onSelectLead }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void }) {
  const { updateLead } = useLeads();
  const now = new Date();
  const [emailCounts, setEmailCounts] = useState<Map<string, number>>(new Map());
  const [sortField, setSortField] = useState<SortField>("default");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openSections, setOpenSections] = useState({ overdue: true, dueThisWeek: true, unanswered: true, untouched: true, goingDark: true });

  const filtered = useMemo(() => {
    if (ownerFilter === "All") return leads;
    if (ownerFilter === "Unassigned") return leads.filter(l => !l.assignedTo);
    return leads.filter(l => l.assignedTo === ownerFilter);
  }, [leads, ownerFilter]);

  const active = useMemo(() => filtered.filter(l => !CLOSED_STAGES.has(l.stage)), [filtered]);

  // Bulk fetch email counts
  useEffect(() => {
    const ids = active.map(l => l.id);
    if (ids.length === 0) { setEmailCounts(new Map()); return; }
    supabase
      .from("lead_emails")
      .select("lead_id")
      .in("lead_id", ids)
      .then(({ data }) => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const row of data) {
          counts.set(row.lead_id, (counts.get(row.lead_id) || 0) + 1);
        }
        setEmailCounts(counts);
      });
  }, [active]);

  // Fetch unanswered inbound emails
  const [unansweredLeadIds, setUnansweredLeadIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = active.map(l => l.id);
    if (ids.length === 0) { setUnansweredLeadIds(new Set()); return; }
    supabase
      .from("lead_emails")
      .select("lead_id, email_date, direction")
      .in("lead_id", ids)
      .order("email_date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const byLead = new Map<string, typeof data>();
        for (const row of data) {
          if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, []);
          byLead.get(row.lead_id)!.push(row);
        }
        const unanswered = new Set<string>();
        byLead.forEach((emails, leadId) => {
          if (emails[0]?.direction === "inbound") unanswered.add(leadId);
        });
        setUnansweredLeadIds(unanswered);
      });
  }, [active]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "dealValue" ? "desc" : "asc"); }
  };

  const handleUpdate = (leadId: string, data: Partial<Lead>) => {
    updateLead(leadId, data);
  };

  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

  // Build sections — dedup: overdue takes priority over goingDark
  const overdueSet = useMemo(() => new Set<string>(), []);

  const overdue = useMemo(() => {
    const items = active
      .filter(l => l.nextFollowUp && isBefore(parseISO(l.nextFollowUp), now))
      .map(l => ({ lead: l, daysOverdue: differenceInDays(now, parseISO(l.nextFollowUp)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    overdueSet.clear();
    items.forEach(i => overdueSet.add(i.lead.id));
    return applySortToLeads(items, sortField, sortDir, (a, b) => b.daysOverdue - a.daysOverdue);
  }, [active, now, sortField, sortDir]);

  const dueThisWeek = useMemo(() => {
    const weekEnd = addDays(now, 7);
    const items = active
      .filter(l => {
        if (!l.nextFollowUp) return false;
        const d = parseISO(l.nextFollowUp);
        return !isBefore(d, now) && isBefore(d, weekEnd);
      });
    return applySortToLeadsDirect(items, sortField, sortDir);
  }, [active, now, sortField, sortDir]);

  const unansweredLeads = useMemo(() => {
    const items = active.filter(l => unansweredLeadIds.has(l.id) && !overdueSet.has(l.id));
    return applySortToLeadsDirect(items, sortField, sortDir);
  }, [active, unansweredLeadIds, overdueSet, sortField, sortDir]);

  const untouched = useMemo(() => {
    const items = active
      .filter(l => l.stage === "New Lead" && !l.lastContactDate && !l.assignedTo)
      .map(l => ({ lead: l, daysOld: differenceInDays(now, parseISO(l.dateSubmitted)) }))
      .sort((a, b) => b.daysOld - a.daysOld);
    return applySortToLeads(items, sortField, sortDir, (a, b) => b.daysOld - a.daysOld);
  }, [active, now, sortField, sortDir]);

  const goingDark = useMemo(() => {
    return active
      .filter(l => {
        if (overdueSet.has(l.id)) return false; // dedup
        if (l.stage === "New Lead") return false;
        const lastDate = l.lastContactDate || l.meetingDate || l.stageEnteredDate || l.dateSubmitted;
        if (!lastDate) return false;
        return differenceInDays(now, parseISO(lastDate)) > 21;
      })
      .map(l => {
        const lastDate = l.lastContactDate || l.meetingDate || l.stageEnteredDate || l.dateSubmitted;
        return { lead: l, daysSilent: differenceInDays(now, parseISO(lastDate!)) };
      })
      .sort((a, b) => b.daysSilent - a.daysSilent);
  }, [active, now, overdueSet, sortField, sortDir]);

  const totalItems = overdue.length + dueThisWeek.length + unansweredLeads.length + untouched.length + goingDark.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{totalItems} items needing action</p>
      </div>

      <SortBar sortField={sortField} sortDir={sortDir} onSort={handleSort} />

      <div className="border border-border rounded-md overflow-hidden">
        {/* Overdue */}
        <SectionHeader title="Overdue" count={overdue.length} dotColor="bg-red-500" open={openSections.overdue} onToggle={() => toggleSection("overdue")} />
        {openSections.overdue && overdue.map(({ lead, daysOverdue }) => (
          <FollowUpRow key={lead.id} lead={lead} label={`${daysOverdue}d overdue`} onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} />
        ))}

        {/* Due This Week */}
        <SectionHeader title="Due This Week" count={dueThisWeek.length} dotColor="bg-blue-500" open={openSections.dueThisWeek} onToggle={() => toggleSection("dueThisWeek")} />
        {openSections.dueThisWeek && dueThisWeek.map(lead => {
          const dueDate = parseISO(lead.nextFollowUp);
          const label = isToday(dueDate) ? "Today" : format(dueDate, "EEE, MMM d");
          return <FollowUpRow key={lead.id} lead={lead} label={label} onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} />;
        })}

        {/* Unanswered Inbound */}
        <SectionHeader title="Unanswered Inbound" count={unansweredLeads.length} dotColor="bg-purple-500" open={openSections.unanswered} onToggle={() => toggleSection("unanswered")} />
        {openSections.unanswered && unansweredLeads.map(lead => (
          <FollowUpRow key={lead.id} lead={lead} label="Awaiting reply" onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} />
        ))}

        {/* Untouched */}
        <SectionHeader title="Untouched New Leads" count={untouched.length} dotColor="bg-emerald-500" open={openSections.untouched} onToggle={() => toggleSection("untouched")} />
        {openSections.untouched && untouched.map(({ lead, daysOld }) => (
          <FollowUpRow key={lead.id} lead={lead} label={`${daysOld}d old`} onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} />
        ))}

        {/* Going Dark */}
        <SectionHeader title="Going Dark" count={goingDark.length} dotColor="bg-amber-500" open={openSections.goingDark} onToggle={() => toggleSection("goingDark")} />
        {openSections.goingDark && goingDark.map(({ lead, daysSilent }) => (
          <FollowUpRow key={lead.id} lead={lead} label={`Silent ${daysSilent}d`} onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} />
        ))}

        {totalItems === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">All caught up — no follow-ups pending</p>
          </div>
        )}
      </div>
    </div>
  );
}
