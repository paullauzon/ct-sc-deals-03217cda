import { useState, useMemo, useEffect } from "react";
import { Lead } from "@/types/lead";
import { useLeads } from "@/contexts/LeadContext";
import { BrandLogo } from "@/components/BrandLogo";
import {
  ChevronDown, ChevronRight, Clock, AlertTriangle, UserX, Ghost,
  Mail, Mic, CalendarCheck, ArrowUpDown, Zap, Send, Phone, RotateCcw,
  Reply, FileText, Loader2
} from "lucide-react";
import { format, parseISO, differenceInDays, isToday, addDays, isBefore } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Went Dark"]);
const STAGE_OPTIONS = ["New Lead", "Qualified", "Contacted", "Meeting Set", "Meeting Held", "Proposal Sent", "Negotiation", "Contract Sent"] as const;

type SortField = "default" | "dealValue" | "lastContact" | "stage" | "name";
type SortDir = "asc" | "desc";
type ActionType = "post-meeting" | "initial-outreach" | "meeting-nudge" | "proposal-followup" | "re-engagement" | "reply-inbound" | "schedule-call" | "prep-brief";

// ─── Action type determination ───
function getActionType(lead: Lead, isUnanswered: boolean): { type: ActionType; label: string; icon: typeof Mail } {
  if (isUnanswered) return { type: "reply-inbound", label: "Reply", icon: Reply };
  if (lead.stage === "New Lead" && !lead.lastContactDate) return { type: "initial-outreach", label: "Draft Outreach", icon: Send };
  if (lead.stage === "Contacted" && !lead.calendlyBookedAt) return { type: "meeting-nudge", label: "Nudge Meeting", icon: Phone };
  if (lead.stage === "Meeting Set") return { type: "prep-brief", label: "Prep Brief", icon: FileText };
  if (lead.stage === "Meeting Held") return { type: "post-meeting", label: "Follow Up", icon: Send };
  if (lead.stage === "Proposal Sent") return { type: "proposal-followup", label: "Check In", icon: Mail };
  const lastDate = lead.lastContactDate || lead.meetingDate || lead.stageEnteredDate || lead.dateSubmitted;
  if (lastDate && differenceInDays(new Date(), parseISO(lastDate)) > 21) return { type: "re-engagement", label: "Re-engage", icon: RotateCcw };
  return { type: "schedule-call", label: "Schedule Call", icon: Phone };
}

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
    <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary/30 transition-colors border-b border-border">
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
  lead, label, labelStyle, onSelect, emailCount, onUpdate, isUnanswered, onAction,
}: {
  lead: Lead; label: string; labelStyle?: string; onSelect: (id: string) => void;
  emailCount: number;
  onUpdate: (id: string, data: Partial<Lead>) => void;
  isUnanswered: boolean;
  onAction: (lead: Lead, actionType: ActionType) => void;
}) {
  const meetingCount = lead.meetings?.length || 0;
  const hasCalendly = !!lead.calendlyBookedAt;
  const recommendation = getRecommendation(lead);
  const lastContact = lead.lastContactDate
    ? (() => { try { return format(parseISO(lead.lastContactDate), "MMM d"); } catch { return "—"; } })()
    : null;
  const action = getActionType(lead, isUnanswered);
  const ActionIcon = action.icon;

  return (
    <div
      className="px-4 py-3.5 hover:bg-secondary/20 transition-all cursor-pointer group border-b border-border last:border-b-0 hover:border-l-2 hover:border-l-foreground/20 hover:pl-[14px]"
      onClick={() => onSelect(lead.id)}
    >
      {/* Line 1: Identity */}
      <div className="flex items-center gap-2 min-w-0">
        <BrandLogo brand={lead.brand} size="xxs" />
        <span className="text-sm font-medium truncate">{lead.name}</span>
        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{lead.company}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground hidden md:inline shrink-0">{lead.stage}</span>
        {lead.assignedTo && (
          <span className="w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center text-[9px] font-semibold shrink-0">{lead.assignedTo[0]}</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full",
            labelStyle || "bg-secondary text-muted-foreground"
          )}>{label}</span>
        </div>
      </div>

      {/* Line 2: Context signals */}
      <div className="flex items-center gap-3 mt-1.5 pl-6 min-w-0">
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

        {/* Action chip — always visible */}
        <div className="ml-auto flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAction(lead, action.type)}
            className="text-[10px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-colors flex items-center gap-1.5 font-medium"
          >
            <ActionIcon className="h-3 w-3" />
            {action.label}
          </button>
        </div>
      </div>

      {/* Line 3: AI recommendation */}
      {recommendation && (
        <p className="text-[10px] text-muted-foreground italic pl-6 mt-1 truncate">{recommendation}</p>
      )}
    </div>
  );
}

// ─── Action Sheet ───
function ActionSheet({
  open, onClose, lead, actionType, onUpdate,
}: {
  open: boolean; onClose: () => void; lead: Lead | null; actionType: ActionType | null;
  onUpdate: (id: string, data: Partial<Lead>) => void;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedFollowUp, setSuggestedFollowUp] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string>("");

  useEffect(() => {
    if (!open || !lead || !actionType) return;
    setContent("");
    setSuggestedFollowUp(null);
    setSelectedStage("");
    generateDraft();
  }, [open, lead?.id, actionType]);

  const generateDraft = async () => {
    if (!lead || !actionType) return;
    setLoading(true);
    try {
      // Find most recent meeting for context
      const recentMeeting = lead.meetings?.length > 0 ? lead.meetings[lead.meetings.length - 1] : null;

      // Fetch last inbound email for reply-inbound
      let lastEmail: any = undefined;
      if (actionType === "reply-inbound") {
        const { data: emailData } = await supabase
          .from("lead_emails")
          .select("from_address, from_name, subject, body_preview")
          .eq("lead_id", lead.id)
          .eq("direction", "inbound")
          .order("email_date", { ascending: false })
          .limit(1);
        if (emailData?.[0]) lastEmail = emailData[0];
      }

      const { data, error } = await supabase.functions.invoke("generate-follow-up-action", {
        body: {
          actionType,
          lead: {
            name: lead.name,
            company: lead.company,
            role: lead.role,
            brand: lead.brand,
            stage: lead.stage,
            dealValue: lead.dealValue,
            serviceInterest: lead.serviceInterest,
            enrichment: lead.enrichment,
            dealIntelligence: lead.dealIntelligence,
          },
          lastEmail,
          meetingContext: recentMeeting ? {
            title: recentMeeting.title,
            date: recentMeeting.date,
            summary: recentMeeting.summary || recentMeeting.intelligence?.summary,
            nextSteps: recentMeeting.nextSteps,
            intelligence: recentMeeting.intelligence,
          } : undefined,
        },
      });

      if (error) throw error;
      setContent(data.content || "");
      setSuggestedFollowUp(data.suggestedFollowUp || null);
    } catch (err) {
      console.error("Failed to generate action:", err);
      toast({ title: "Failed to generate draft", description: "Try again or write manually.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!lead) return;
    const updates: Partial<Lead> = { lastContactDate: format(new Date(), "yyyy-MM-dd") };
    if (suggestedFollowUp) updates.nextFollowUp = suggestedFollowUp;
    if (selectedStage) {
      updates.stage = selectedStage as Lead["stage"];
      updates.stageEnteredDate = format(new Date(), "yyyy-MM-dd");
    }
    onUpdate(lead.id, updates);
    toast({ title: "Lead updated", description: `${lead.name} marked as contacted.` });
    onClose();
  };

  const actionLabels: Record<string, string> = {
    "post-meeting": "Post-Meeting Follow-Up",
    "initial-outreach": "Initial Outreach Draft",
    "meeting-nudge": "Meeting Booking Nudge",
    "proposal-followup": "Proposal Check-In",
    "re-engagement": "Re-Engagement Email",
    "reply-inbound": "Reply to Inbound",
    "schedule-call": "Call Planning",
    "prep-brief": "Pre-Meeting Brief",
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            {lead && <BrandLogo brand={lead.brand} size="xxs" />}
            <span>{lead?.name}</span>
            <span className="text-muted-foreground font-normal">· {actionType && actionLabels[actionType]}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">AI-generated action draft for {lead?.name}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* AI-generated content */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              {actionType === "schedule-call" || actionType === "prep-brief" ? "Brief" : "Draft Email"}
            </label>
            {loading ? (
              <div className="flex items-center justify-center py-12 border border-border rounded-md">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Generating AI draft...</span>
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[240px] text-sm font-mono leading-relaxed"
                placeholder="AI draft will appear here..."
              />
            )}
          </div>

          {/* Suggested follow-up */}
          {suggestedFollowUp && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                Suggested Next Follow-Up
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border border-border hover:bg-secondary/50 transition-colors">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    {(() => { try { return format(parseISO(suggestedFollowUp), "EEE, MMM d"); } catch { return suggestedFollowUp; } })()}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={suggestedFollowUp ? parseISO(suggestedFollowUp) : undefined}
                    onSelect={(date) => { if (date) setSuggestedFollowUp(format(date, "yyyy-MM-dd")); }}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Stage change */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Advance Stage (optional)
            </label>
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={lead?.stage || "Current stage"} />
              </SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              onClick={handleApply}
              className="flex-1 text-xs py-2.5 rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
            >
              Mark Contacted & Update
            </button>
            <button
              onClick={generateDraft}
              disabled={loading}
              className="text-xs px-3 py-2.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors"
            >
              Regenerate
            </button>
          </div>

          {/* Copy */}
          {content && (
            <div className="flex gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(content); toast({ title: "Copied to clipboard" }); }}
                className="flex-1 text-xs py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Copy All
              </button>
              {content.includes("\n\n") && (
                <button
                  onClick={() => {
                    const idx = content.indexOf("\n\n");
                    const subject = content.slice(0, idx).replace(/^Subject:\s*/i, "");
                    const body = content.slice(idx + 2);
                    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
                    toast({ title: "Copied as email", description: `Subject: ${subject.slice(0, 50)}…` });
                  }}
                  className="flex-1 text-xs py-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Copy as Email
                </button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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

  // Action sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLead, setSheetLead] = useState<Lead | null>(null);
  const [sheetActionType, setSheetActionType] = useState<ActionType | null>(null);

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

  const handleAction = (lead: Lead, actionType: ActionType) => {
    setSheetLead(lead);
    setSheetActionType(actionType);
    setSheetOpen(true);
  };

  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

  // Build sections — dedup: overdue takes priority over goingDark
  const overdue = useMemo(() => {
    const items = active
      .filter(l => l.nextFollowUp && isBefore(parseISO(l.nextFollowUp), now))
      .map(l => ({ lead: l, daysOverdue: differenceInDays(now, parseISO(l.nextFollowUp)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    return applySortToLeads(items, sortField, sortDir, (a, b) => b.daysOverdue - a.daysOverdue);
  }, [active, now, sortField, sortDir]);

  const overdueSet = useMemo(() => new Set(overdue.map(i => i.lead.id)), [overdue]);

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
    const items = active
      .filter(l => {
        if (overdueSet.has(l.id)) return false;
        if (l.stage === "New Lead") return false;
        const lastDate = l.lastContactDate || l.meetingDate || l.stageEnteredDate || l.dateSubmitted;
        if (!lastDate) return false;
        return differenceInDays(now, parseISO(lastDate)) > 21;
      })
      .map(l => {
        const lastDate = l.lastContactDate || l.meetingDate || l.stageEnteredDate || l.dateSubmitted;
        return { lead: l, daysSilent: differenceInDays(now, parseISO(lastDate!)) };
      });
    return applySortToLeads(items, sortField, sortDir, (a, b) => b.daysSilent - a.daysSilent);
  }, [active, now, overdueSet, sortField, sortDir]);

  const totalItems = overdue.length + dueThisWeek.length + unansweredLeads.length + untouched.length + goingDark.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{totalItems} items</span>
        {overdue.length > 0 && <span className="tabular-nums"><span className="text-red-600 dark:text-red-400 font-medium">{overdue.length}</span> Overdue</span>}
        {dueThisWeek.length > 0 && <span className="tabular-nums"><span className="text-blue-600 dark:text-blue-400 font-medium">{dueThisWeek.length}</span> Due This Week</span>}
        {unansweredLeads.length > 0 && <span className="tabular-nums"><span className="text-purple-600 dark:text-purple-400 font-medium">{unansweredLeads.length}</span> Unanswered</span>}
        {untouched.length > 0 && <span className="tabular-nums"><span className="text-emerald-600 dark:text-emerald-400 font-medium">{untouched.length}</span> Untouched</span>}
        {goingDark.length > 0 && <span className="tabular-nums"><span className="text-amber-600 dark:text-amber-400 font-medium">{goingDark.length}</span> Going Dark</span>}
      </div>

      <SortBar sortField={sortField} sortDir={sortDir} onSort={handleSort} />

      <div className="border border-border rounded-md overflow-hidden">
        {/* Overdue */}
        <SectionHeader title="Overdue" count={overdue.length} dotColor="bg-red-500" open={openSections.overdue} onToggle={() => toggleSection("overdue")} />
        {openSections.overdue && overdue.map(({ lead, daysOverdue }) => (
          <FollowUpRow key={lead.id} lead={lead} label={daysOverdue === 0 ? "Due today" : `${daysOverdue}d overdue`} labelStyle={daysOverdue === 0 ? "bg-foreground text-background" : "bg-red-500/10 text-red-600 dark:text-red-400"} onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} isUnanswered={unansweredLeadIds.has(lead.id)} onAction={handleAction} />
        ))}

        {/* Due This Week */}
        <SectionHeader title="Due This Week" count={dueThisWeek.length} dotColor="bg-blue-500" open={openSections.dueThisWeek} onToggle={() => toggleSection("dueThisWeek")} />
        {openSections.dueThisWeek && dueThisWeek.map(lead => {
          const dueDate = parseISO(lead.nextFollowUp);
          const label = isToday(dueDate) ? "Today" : format(dueDate, "EEE, MMM d");
          return <FollowUpRow key={lead.id} lead={lead} label={label} labelStyle={isToday(dueDate) ? "bg-foreground text-background" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"} onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} isUnanswered={unansweredLeadIds.has(lead.id)} onAction={handleAction} />;
        })}

        {/* Unanswered Inbound */}
        <SectionHeader title="Unanswered Inbound" count={unansweredLeads.length} dotColor="bg-purple-500" open={openSections.unanswered} onToggle={() => toggleSection("unanswered")} />
        {openSections.unanswered && unansweredLeads.map(lead => (
          <FollowUpRow key={lead.id} lead={lead} label="Awaiting reply" labelStyle="bg-purple-500/10 text-purple-600 dark:text-purple-400" onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} isUnanswered={true} onAction={handleAction} />
        ))}

        {/* Untouched */}
        <SectionHeader title="Untouched New Leads" count={untouched.length} dotColor="bg-emerald-500" open={openSections.untouched} onToggle={() => toggleSection("untouched")} />
        {openSections.untouched && untouched.map(({ lead, daysOld }) => (
          <FollowUpRow key={lead.id} lead={lead} label={`${daysOld}d old`} labelStyle="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} isUnanswered={unansweredLeadIds.has(lead.id)} onAction={handleAction} />
        ))}

        {/* Going Dark */}
        <SectionHeader title="Going Dark" count={goingDark.length} dotColor="bg-amber-500" open={openSections.goingDark} onToggle={() => toggleSection("goingDark")} />
        {openSections.goingDark && goingDark.map(({ lead, daysSilent }) => (
          <FollowUpRow key={lead.id} lead={lead} label={`Silent ${daysSilent}d`} labelStyle="bg-amber-500/10 text-amber-600 dark:text-amber-400" onSelect={onSelectLead} emailCount={emailCounts.get(lead.id) || 0} onUpdate={handleUpdate} isUnanswered={unansweredLeadIds.has(lead.id)} onAction={handleAction} />
        ))}

        {totalItems === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">All caught up — no follow-ups pending</p>
          </div>
        )}
      </div>

      {/* AI Action Sheet */}
      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        lead={sheetLead}
        actionType={sheetActionType}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
