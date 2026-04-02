import { useState, useMemo, useEffect } from "react";
import { Lead } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { BrandLogo } from "@/components/BrandLogo";
import { ChevronDown, ChevronRight, Clock, AlertTriangle, UserX, Ghost, Mail, CalendarClock } from "lucide-react";
import { format, parseISO, differenceInDays, isToday, addDays, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const STAGE_OPTIONS = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

interface UnansweredEmail {
  leadId: string;
  leadName: string;
  company: string;
  brand: string;
  subject: string;
  fromName: string;
  emailDate: string;
  daysSince: number;
}

function CollapsibleSection({
  title, icon: Icon, count, colorClass, children, defaultOpen = true,
}: {
  title: string; icon: typeof Clock; count: number; colorClass: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors">
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${colorClass}`}>{title}</span>
        <span className="text-[10px] text-muted-foreground">({count})</span>
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" /> : <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />}
      </button>
      {open && <div className="divide-y divide-border">{children}</div>}
    </div>
  );
}

function FollowUpRow({ lead, label, labelColor, onSelect, onMarkContacted, onSetFollowUp, onChangeStage }: {
  lead: Lead; label: string; labelColor: string; onSelect: (id: string) => void;
  onMarkContacted?: (id: string) => void;
  onSetFollowUp?: (id: string, date: string) => void;
  onChangeStage?: (id: string, stage: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => onSelect(lead.id)}>
      <BrandLogo brand={lead.brand} size="xxs" />
      <span className="text-sm font-medium truncate min-w-0">{lead.name}</span>
      <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{lead.company}</span>
      <span className="text-[10px] text-muted-foreground hidden md:inline">{lead.stage}</span>
      {lead.assignedTo && (
        <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">{lead.assignedTo[0]}</span>
      )}
      <span className={`text-xs font-medium ml-auto whitespace-nowrap ${labelColor}`}>{label}</span>
      {lead.dealValue > 0 && (
        <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">${lead.dealValue.toLocaleString()}</span>
      )}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {onSetFollowUp && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Set follow-up date">
                <CalendarClock className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={undefined}
                onSelect={(date) => { if (date) onSetFollowUp(lead.id, format(date, "yyyy-MM-dd")); }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        )}
        {onChangeStage && (
          <Select onValueChange={(val) => onChangeStage(lead.id, val)}>
            <SelectTrigger className="h-5 w-[70px] text-[9px] px-1 border-border">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {onMarkContacted && (
          <button
            onClick={() => onMarkContacted(lead.id)}
            className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
          >
            Contacted
          </button>
        )}
      </div>
    </div>
  );
}

export function FollowUpsTab({ leads, ownerFilter, onSelectLead }: { leads: Lead[]; ownerFilter: string; onSelectLead: (id: string) => void }) {
  const { updateLead } = useLeads();
  const now = new Date();
  const [unansweredEmails, setUnansweredEmails] = useState<UnansweredEmail[]>([]);

  const filtered = useMemo(() => {
    if (ownerFilter === "All") return leads;
    if (ownerFilter === "Unassigned") return leads.filter(l => !l.assignedTo);
    return leads.filter(l => l.assignedTo === ownerFilter);
  }, [leads, ownerFilter]);

  const active = useMemo(() => filtered.filter(l => !CLOSED_STAGES.has(l.stage)), [filtered]);

  // Fetch unanswered inbound emails
  useEffect(() => {
    const leadIds = filtered.filter(l => !CLOSED_STAGES.has(l.stage)).map(l => l.id);
    if (leadIds.length === 0) { setUnansweredEmails([]); return; }

    supabase
      .from("lead_emails")
      .select("lead_id, subject, from_name, email_date, direction")
      .in("lead_id", leadIds)
      .order("email_date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        // Group by lead_id, check if last email is inbound
        const byLead = new Map<string, typeof data>();
        for (const row of data) {
          if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, []);
          byLead.get(row.lead_id)!.push(row);
        }
        const unanswered: UnansweredEmail[] = [];
        byLead.forEach((emails, leadId) => {
          const latest = emails[0];
          if (latest.direction === "inbound") {
            const lead = filtered.find(l => l.id === leadId);
            if (lead) {
              unanswered.push({
                leadId,
                leadName: lead.name,
                company: lead.company,
                brand: lead.brand,
                subject: latest.subject || "(no subject)",
                fromName: latest.from_name || "",
                emailDate: latest.email_date,
                daysSince: differenceInDays(now, new Date(latest.email_date)),
              });
            }
          }
        });
        setUnansweredEmails(unanswered.sort((a, b) => b.daysSince - a.daysSince));
      });
  }, [filtered, now]);

  const overdue = useMemo(() => {
    return active
      .filter(l => l.nextFollowUp && isBefore(parseISO(l.nextFollowUp), now))
      .map(l => ({ lead: l, daysOverdue: differenceInDays(now, parseISO(l.nextFollowUp)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [active, now]);

  const dueThisWeek = useMemo(() => {
    const weekEnd = addDays(now, 7);
    return active
      .filter(l => {
        if (!l.nextFollowUp) return false;
        const d = parseISO(l.nextFollowUp);
        return !isBefore(d, now) && isBefore(d, weekEnd);
      })
      .sort((a, b) => new Date(a.nextFollowUp).getTime() - new Date(b.nextFollowUp).getTime());
  }, [active, now]);

  const untouched = useMemo(() => {
    return active
      .filter(l => l.stage === "New Lead" && !l.lastContactDate && !l.assignedTo)
      .map(l => ({ lead: l, daysOld: differenceInDays(now, parseISO(l.dateSubmitted)) }))
      .sort((a, b) => b.daysOld - a.daysOld);
  }, [active, now]);

  const goingDark = useMemo(() => {
    return active
      .filter(l => {
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
  }, [active, now]);

  const handleMarkContacted = (leadId: string) => {
    updateLead(leadId, { lastContactDate: format(now, "yyyy-MM-dd") });
  };

  const handleSetFollowUp = (leadId: string, date: string) => {
    updateLead(leadId, { nextFollowUp: date });
  };

  const handleChangeStage = (leadId: string, stage: string) => {
    updateLead(leadId, { stage: stage as Lead["stage"], stageEnteredDate: format(now, "yyyy-MM-dd") });
  };

  const totalItems = overdue.length + dueThisWeek.length + untouched.length + goingDark.length + unansweredEmails.length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{totalItems} items needing follow-up action</p>

      <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
        <CollapsibleSection title="Overdue Follow-Ups" icon={AlertTriangle} count={overdue.length} colorClass="text-red-600 dark:text-red-400">
          {overdue.map(({ lead, daysOverdue }) => (
            <FollowUpRow key={lead.id} lead={lead} label={`${daysOverdue}d overdue`} labelColor="text-red-600 dark:text-red-400" onSelect={onSelectLead} onMarkContacted={handleMarkContacted} onSetFollowUp={handleSetFollowUp} onChangeStage={handleChangeStage} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Due This Week" icon={Clock} count={dueThisWeek.length} colorClass="text-blue-600 dark:text-blue-400">
          {dueThisWeek.map(lead => {
            const dueDate = parseISO(lead.nextFollowUp);
            const label = isToday(dueDate) ? "Today" : format(dueDate, "EEE, MMM d");
            return <FollowUpRow key={lead.id} lead={lead} label={label} labelColor="text-blue-600 dark:text-blue-400" onSelect={onSelectLead} onMarkContacted={handleMarkContacted} onSetFollowUp={handleSetFollowUp} onChangeStage={handleChangeStage} />;
          })}
        </CollapsibleSection>

        <CollapsibleSection title="Unanswered Inbound" icon={Mail} count={unansweredEmails.length} colorClass="text-purple-600 dark:text-purple-400">
          {unansweredEmails.map(email => (
            <div key={email.leadId} onClick={() => onSelectLead(email.leadId)} className="flex items-center gap-3 px-4 py-2 hover:bg-secondary/30 transition-colors cursor-pointer">
              <BrandLogo brand={email.brand as any} size="xxs" />
              <span className="text-sm font-medium truncate min-w-0">{email.leadName}</span>
              <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{email.company}</span>
              <span className="text-[10px] text-muted-foreground truncate hidden md:inline max-w-[200px]">{email.subject}</span>
              <span className="text-xs font-medium ml-auto whitespace-nowrap text-purple-600 dark:text-purple-400">{email.daysSince}d ago</span>
            </div>
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Untouched New Leads" icon={UserX} count={untouched.length} colorClass="text-emerald-600 dark:text-emerald-400">
          {untouched.map(({ lead, daysOld }) => (
            <FollowUpRow key={lead.id} lead={lead} label={`${daysOld}d old`} labelColor="text-emerald-600 dark:text-emerald-400" onSelect={onSelectLead} onMarkContacted={handleMarkContacted} onSetFollowUp={handleSetFollowUp} onChangeStage={handleChangeStage} />
          ))}
        </CollapsibleSection>

        <CollapsibleSection title="Going Dark" icon={Ghost} count={goingDark.length} colorClass="text-amber-600 dark:text-amber-400">
          {goingDark.map(({ lead, daysSilent }) => (
            <FollowUpRow key={lead.id} lead={lead} label={`Silent ${daysSilent}d`} labelColor="text-amber-600 dark:text-amber-400" onSelect={onSelectLead} onMarkContacted={handleMarkContacted} onSetFollowUp={handleSetFollowUp} onChangeStage={handleChangeStage} />
          ))}
        </CollapsibleSection>

        {totalItems === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">No follow-ups pending — all caught up</p>
          </div>
        )}
      </div>
    </div>
  );
}
