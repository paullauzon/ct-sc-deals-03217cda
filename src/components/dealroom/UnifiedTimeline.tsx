import { useEffect, useMemo, useState } from "react";
import { Lead, Meeting, MeetingIntelligence } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { ActivityLogEntry, fetchActivityLog } from "@/lib/activityLog";
import { TranscriptDrawer } from "@/components/lead-panel/dialogs/TranscriptDrawer";
import {
  Mail,
  GitCommit,
  MessageSquare,
  CalendarCheck,
  FileInput,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Video,
  Search,
  Pin,
  PinOff,
  ChevronsDown,
  ChevronsUp,
  Eye,
  MousePointerClick,
  Reply,
  Sparkles,
  Paperclip,
  Phone,
  CheckSquare,
  AlertTriangle,
  PauseCircle,
  FileText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ReplyPrefill } from "@/components/EmailsSection";

type FilterKey = "all" | "emails" | "calls" | "notes" | "meetings" | "tasks" | "stage" | "system" | "pinned";
type DateRange = "all" | "7d" | "30d" | "90d";

interface TimelineEvent {
  id: string;
  type:
    | "stage_change"
    | "meeting"
    | "email_in"
    | "email_out"
    | "calendly"
    | "submission"
    | "note"
    | "system"
    | "call"
    | "task"
    | "sequence_paused";
  date: string;
  title: string;
  detail?: string;
  meta?: string;
  href?: string;
  /** present when the event is backed by a row in lead_activity_log and can be pinned */
  activityId?: string;
  pinnedAt?: string | null;
  /** email-specific enrichment (only set for email_in / email_out rows) */
  email?: EmailRow;
  /** task-specific enrichment (only set for task rows) */
  task?: TaskRow;
  /** meeting-specific enrichment (only set for meeting rows) */
  meeting?: Meeting;
  /** AI-extracted intel from a call summary (only set for call rows) */
  callIntel?: CallIntel | null;
  /** raw sequence step label captured on sequence_paused rows (e.g. "S5-A") */
  sequenceStep?: string;
}

interface EmailRow {
  id: string;
  direction: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  subject: string | null;
  body_preview: string | null;
  body_text: string | null;
  email_date: string;
  thread_id: string | null;
  message_id: string | null;
  opens: unknown;
  clicks: unknown;
  replied_at: string | null;
  ai_drafted: boolean | null;
  sequence_step: string | null;
  attachments: unknown;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  status: string;
  task_type: string | null;
  playbook: string | null;
  created_at: string | null;
  completed_at: string | null;
}

/** AI-extracted call intelligence shape (matches extract-call-intel edge function output). */
interface CallIntel {
  decisions?: string[];
  actionItems?: { owner?: "us" | "them" | "shared"; item: string; deadline?: string }[];
  nextStep?: string;
  engagement?: "Highly Engaged" | "Engaged" | "Passive" | "Disengaged";
  objections?: string[];
  painPoints?: string[];
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "emails", label: "Emails" },
  { key: "calls", label: "Calls" },
  { key: "notes", label: "Notes" },
  { key: "meetings", label: "Meetings" },
  { key: "tasks", label: "Tasks" },
  { key: "stage", label: "Stage" },
  { key: "system", label: "Logged" },
  { key: "pinned", label: "Pinned" },
];

const RANGES: { key: DateRange; label: string; days: number | null }[] = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "all", label: "All time", days: null },
];

function eventMatchesFilter(e: TimelineEvent, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "pinned") return !!e.pinnedAt;
  if (f === "emails") return e.type === "email_in" || e.type === "email_out" || e.type === "sequence_paused";
  if (f === "calls") return e.type === "call";
  if (f === "meetings") return e.type === "meeting" || e.type === "calendly";
  if (f === "tasks") return e.type === "task";
  if (f === "stage") return e.type === "stage_change";
  if (f === "notes") return e.type === "note";
  if (f === "system") return e.type === "submission" || e.type === "system";
  return true;
}

function iconFor(type: TimelineEvent["type"]) {
  switch (type) {
    case "stage_change": return <GitCommit className="h-3.5 w-3.5" />;
    case "meeting": return <Video className="h-3.5 w-3.5" />;
    case "calendly": return <CalendarCheck className="h-3.5 w-3.5" />;
    case "email_in": return <ArrowDownLeft className="h-3.5 w-3.5" />;
    case "email_out": return <ArrowUpRight className="h-3.5 w-3.5" />;
    case "note": return <MessageSquare className="h-3.5 w-3.5" />;
    case "submission": return <FileInput className="h-3.5 w-3.5" />;
    case "call": return <Phone className="h-3.5 w-3.5" />;
    case "task": return <CheckSquare className="h-3.5 w-3.5" />;
    case "sequence_paused": return <PauseCircle className="h-3.5 w-3.5" />;
    default: return <Clock className="h-3.5 w-3.5" />;
  }
}

function monthKey(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (diff === 0) return `Today · ${time}`;
    if (diff === 1) return `Yesterday · ${time}`;
    if (diff < 7) return `${diff}d ago · ${time}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` · ${time}`;
  } catch {
    return iso;
  }
}

export function UnifiedTimeline({ lead, onReply }: { lead: Lead; onReply?: (prefill: ReplyPrefill) => void }) {
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [loading, setLoading] = useState(true);
  // Toggle to expand/collapse all detail bodies at once
  const [expandAllNonce, setExpandAllNonce] = useState(0);
  const [forcedOpen, setForcedOpen] = useState<boolean | null>(null);
  // Transcript drawer state — opened from any meeting row
  const [transcriptMeeting, setTranscriptMeeting] = useState<Meeting | null>(null);

  const refetchActivity = async () => {
    const log = await fetchActivityLog(lead.id);
    setActivity(log);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchActivityLog(lead.id),
      supabase
        .from("lead_emails")
        .select("id,direction,from_address,from_name,to_addresses,subject,body_preview,body_text,email_date,thread_id,message_id,opens,clicks,replied_at,ai_drafted,sequence_step,attachments")
        .eq("lead_id", lead.id)
        .order("email_date", { ascending: false })
        .limit(200),
      supabase
        .from("lead_tasks")
        .select("id,title,description,due_date,status,task_type,playbook,created_at,completed_at")
        .eq("lead_id", lead.id)
        .order("due_date", { ascending: false })
        .limit(200),
    ]).then(([log, emailRes, taskRes]) => {
      if (cancelled) return;
      setActivity(log);
      setEmails((emailRes.data as unknown as EmailRow[]) || []);
      setTasks((taskRes.data as unknown as TaskRow[]) || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [lead.id]);

  const togglePin = async (activityId: string, currentlyPinned: boolean) => {
    const { error } = await (supabase as any)
      .from("lead_activity_log")
      .update({ pinned_at: currentlyPinned ? null : new Date().toISOString() })
      .eq("id", activityId);
    if (error) { toast.error("Couldn't update pin"); return; }
    toast.success(currentlyPinned ? "Unpinned" : "Pinned to top");
    refetchActivity();
  };

  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = [];

    // Activity log (stage changes, field updates, notes, calls, sequence-paused) — pinnable
    activity.forEach(a => {
      const actor = (a as any).actor_name as string | undefined;
      const meta = (a as any).metadata as Record<string, unknown> | undefined;
      const evType: TimelineEvent["type"] =
        a.event_type === "stage_change" ? "stage_change"
        : a.event_type === "note_added" ? "note"
        : a.event_type === "meeting_added" ? "meeting"
        : a.event_type === "call_logged" ? "call"
        : a.event_type === "sequence_paused" ? "sequence_paused"
        : "system";

      // Extract call intel from metadata when present
      const callIntel: CallIntel | null =
        evType === "call" && meta && typeof meta === "object" && (meta as any).intel
          ? ((meta as any).intel as CallIntel)
          : null;

      // For calls, prefer the raw summary as the expandable detail (mockup parity).
      const callSummary = evType === "call" && meta && typeof (meta as any).summary === "string"
        ? ((meta as any).summary as string)
        : "";

      out.push({
        id: `act-${a.id}`,
        activityId: a.id,
        pinnedAt: (a as any).pinned_at || null,
        type: evType,
        date: a.created_at,
        title: a.description,
        detail: callSummary || undefined,
        meta: actor && actor.trim() ? `by ${actor}` : "by System",
        callIntel,
        sequenceStep: evType === "sequence_paused" ? (a.new_value || "") : undefined,
      });
    });

    // Tasks — surface every task as a timeline row anchored to its due date
    tasks.forEach(t => {
      const isDone = t.status === "done" || !!t.completed_at;
      const isOverdue = !isDone && new Date(t.due_date) < new Date();
      const statusLabel = isDone ? "Task done" : isOverdue ? "Task overdue" : "Task upcoming";
      const dueStr = (() => {
        try { return new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return t.due_date; }
      })();
      out.push({
        id: `task-${t.id}`,
        type: "task",
        date: (isDone && t.completed_at) ? t.completed_at : t.due_date,
        title: t.title,
        detail: t.description || undefined,
        meta: `${statusLabel} · due ${dueStr}`,
        task: t,
      });
    });

    // Meetings
    (lead.meetings || []).forEach(m => {
      const intel = m.intelligence;
      out.push({
        id: `meet-${m.id}`,
        type: "meeting",
        date: m.date,
        title: m.title || "Meeting",
        detail: intel?.summary || m.summary || undefined,
        meta: intel?.attendees?.length ? `${intel.attendees.length} attendees` : undefined,
        href: m.firefliesUrl || undefined,
        meeting: m,
      });
    });

    // Emails
    emails.forEach(e => {
      const isOut = e.direction === "outbound";
      out.push({
        id: `email-${e.id}`,
        type: isOut ? "email_out" : "email_in",
        date: e.email_date,
        title: e.subject || "(No subject)",
        detail: e.body_preview || undefined,
        meta: isOut
          ? `To ${(e.to_addresses || []).slice(0, 2).join(", ")}`
          : `From ${e.from_name || e.from_address}`,
        email: e,
      });
    });

    // Calendly booking
    if (lead.calendlyBookedAt) {
      out.push({
        id: "calendly",
        type: "calendly",
        date: lead.calendlyBookedAt,
        title: lead.calendlyEventName || "Calendly meeting booked",
        meta: lead.calendlyEventDuration ? `${lead.calendlyEventDuration} min` : undefined,
      });
    }

    // Submissions
    (lead.submissions || []).forEach((s, i) => {
      out.push({
        id: `sub-${i}`,
        type: "submission",
        date: s.dateSubmitted,
        title: `${s.source} submission`,
        detail: s.message?.slice(0, 200) || undefined,
        meta: s.brand,
      });
    });

    return out
      .filter(e => e.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activity, emails, tasks, lead]);

  // Apply filter + search + date range
  const filtered = useMemo(() => {
    const cutoff = (() => {
      const cfg = RANGES.find(r => r.key === range);
      if (!cfg || cfg.days == null) return 0;
      return Date.now() - cfg.days * 86400000;
    })();
    const q = search.trim().toLowerCase();
    return events.filter(e => {
      if (!eventMatchesFilter(e, filter)) return false;
      if (cutoff && new Date(e.date).getTime() < cutoff) return false;
      if (q) {
        const hay = `${e.title} ${e.detail || ""} ${e.meta || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, filter, search, range]);

  // Pinned section first, then chronological
  const pinned = useMemo(() => filtered.filter(e => e.pinnedAt), [filtered]);
  const unpinned = useMemo(() => filtered.filter(e => !e.pinnedAt), [filtered]);

  const groups = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    unpinned.forEach(e => {
      const k = monthKey(e.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return Array.from(map.entries());
  }, [unpinned]);

  const counts = useMemo(() => ({
    all: events.length,
    emails: events.filter(e => e.type === "email_in" || e.type === "email_out" || e.type === "sequence_paused").length,
    calls: events.filter(e => e.type === "call").length,
    meetings: events.filter(e => e.type === "meeting" || e.type === "calendly").length,
    tasks: events.filter(e => e.type === "task").length,
    stage: events.filter(e => e.type === "stage_change").length,
    notes: events.filter(e => e.type === "note").length,
    system: events.filter(e => e.type === "submission" || e.type === "system").length,
    pinned: events.filter(e => e.pinnedAt).length,
  }), [events]);

  const toggleAll = (open: boolean) => {
    setForcedOpen(open);
    setExpandAllNonce(n => n + 1);
  };

  // Default-expand the most recent 10 events (mockup spec: "expanded for recent 10, collapsed for older")
  // Build a position map across pinned + chronological so the top 10 (in render order) are open by default.
  const defaultOpenIds = useMemo(() => {
    const ordered: string[] = [...pinned.map(e => e.id), ...unpinned.map(e => e.id)];
    return new Set(ordered.slice(0, 10));
  }, [pinned, unpinned]);

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="space-y-2 sticky top-0 z-20 bg-background/95 backdrop-blur-sm pt-1 pb-2 -mx-1 px-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                filter === f.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
              )}
            >
              {f.label}
              <span className={cn(
                "ml-1.5 tabular-nums",
                filter === f.key ? "text-background/70" : "text-muted-foreground/60"
              )}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity, emails, notes…"
              className="h-7 pl-7 text-[11px]"
            />
          </div>
          <div className="flex items-center border border-border rounded overflow-hidden">
            {RANGES.map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "px-2 h-7 text-[10px] font-medium transition-colors border-l border-border first:border-l-0",
                  range === r.key
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button
              onClick={() => toggleAll(true)}
              className="px-1.5 h-7 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
              title="Expand all"
            >
              <ChevronsDown className="h-3 w-3" />
            </button>
            <button
              onClick={() => toggleAll(false)}
              className="px-1.5 h-7 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors border-l border-border"
              title="Collapse all"
            >
              <ChevronsUp className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground/60 text-center py-12">Loading activity…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 text-center py-12">No activity in this view yet</p>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <div>
              <div className="py-1.5 mb-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Pin className="h-2.5 w-2.5" /> Pinned
                </h3>
              </div>
              <div className="relative">
                <div className="absolute left-[13px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-1">
                  {pinned.map(ev => (
                    <TimelineRow
                      key={ev.id}
                      event={ev}
                      onTogglePin={togglePin}
                      forcedOpen={forcedOpen}
                      forceNonce={expandAllNonce}
                      onReply={onReply}
                      defaultExpanded={defaultOpenIds.has(ev.id)}
                      stallReason={lead.stallReason}
                      onOpenTranscript={setTranscriptMeeting}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          {groups.map(([month, items]) => (
            <div key={month}>
              <div className="sticky top-[4.25rem] bg-background/95 backdrop-blur-sm py-1.5 mb-2 z-10">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {month}
                </h3>
              </div>
              <div className="relative">
                <div className="absolute left-[13px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-1">
                  {items.map(ev => (
                    <TimelineRow
                      key={ev.id}
                      event={ev}
                      onTogglePin={togglePin}
                      forcedOpen={forcedOpen}
                      forceNonce={expandAllNonce}
                      onReply={onReply}
                      defaultExpanded={defaultOpenIds.has(ev.id)}
                      stallReason={lead.stallReason}
                      onOpenTranscript={setTranscriptMeeting}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <TranscriptDrawer
        meeting={transcriptMeeting}
        open={!!transcriptMeeting}
        onOpenChange={(o) => { if (!o) setTranscriptMeeting(null); }}
      />
    </div>
  );
}

function countFrom(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return value;
  return 0;
}

function TimelineRow({
  event,
  onTogglePin,
  forcedOpen,
  forceNonce,
  onReply,
  defaultExpanded = false,
  stallReason = "",
  onOpenTranscript,
}: {
  event: TimelineEvent;
  onTogglePin: (id: string, currentlyPinned: boolean) => void;
  forcedOpen: boolean | null;
  forceNonce: number;
  onReply?: (prefill: ReplyPrefill) => void;
  defaultExpanded?: boolean;
  stallReason?: string;
  onOpenTranscript?: (m: Meeting) => void;
}) {
  const isMeeting = event.type === "meeting";
  const isCall = event.type === "call";
  const isSequencePaused = event.type === "sequence_paused";
  const meeting = event.meeting;
  const intel = meeting?.intelligence;
  const callIntel = event.callIntel;

  const hasMeetingIntel = !!intel && (
    !!intel.decisions?.length || !!intel.actionItems?.length || !!intel.nextMeetingRecommendation ||
    !!intel.engagementLevel || !!intel.buyerJourney || typeof intel.talkRatio === "number"
  );
  const hasCallIntel = !!callIntel && (
    !!callIntel.decisions?.length || !!callIntel.actionItems?.length || !!callIntel.nextStep ||
    !!callIntel.engagement
  );

  // Expandable when there is a body OR rich AI intel to reveal
  const expandable = !!event.detail || hasMeetingIntel || hasCallIntel;
  const [open, setOpen] = useState(defaultExpanded && expandable);
  const isEmail = event.type === "email_in" || event.type === "email_out";
  const isInbound = event.type === "email_in";
  const email = event.email;
  const task = event.task;
  const isTask = event.type === "task";

  // React to expand-all / collapse-all toggle from parent
  useEffect(() => {
    if (forcedOpen === null) return;
    setOpen(forcedOpen && expandable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceNonce]);

  const canPin = !!event.activityId;
  const isPinned = !!event.pinnedAt;

  // Email enrichments
  const opens = countFrom(email?.opens);
  const clicks = countFrom(email?.clicks);
  const attachments = countFrom(email?.attachments);
  const replied = !!email?.replied_at;
  const aiDrafted = !!email?.ai_drafted;
  const sequence = email?.sequence_step || "";

  // Task enrichments
  const taskIsDone = !!task && (task.status === "done" || !!task.completed_at);
  const taskIsOverdue = !!task && !taskIsDone && new Date(task.due_date) < new Date();
  const taskSourceLabel = (() => {
    if (!task) return "";
    const pb = (task.playbook || "").toLowerCase();
    if (pb.startsWith("sla-")) return "SLA auto-created";
    if (pb === "manual" || !pb) return "Manual";
    return "Auto-task";
  })();

  // Call meta extraction (outcome, duration) from activity row
  const callOutcome = isCall && event.title ? (event.title.match(/Call logged: ([^·]+)/i)?.[1] || "").trim() : "";
  const callDurationMin = isCall && event.title ? (event.title.match(/(\d+)m/)?.[1] || "") : "";

  const handleReply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onReply || !email) return;
    const subj = email.subject || "";
    const replySubj = /^re:/i.test(subj) ? subj : `Re: ${subj}`;
    const dateStr = new Date(email.email_date).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
    const sender = email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address;
    const quoted = (email.body_text || email.body_preview || "").split("\n").map(l => `> ${l}`).join("\n");
    onReply({
      to: email.from_address,
      subject: replySubj,
      thread_id: email.thread_id || "",
      in_reply_to: email.message_id || "",
      quote: `On ${dateStr}, ${sender} wrote:\n${quoted}`,
    });
  };

  return (
    <div className="relative pl-9 group/row">
      <div className="absolute left-1.5 top-2 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground">
        {iconFor(event.type)}
      </div>
      <button
        type="button"
        onClick={() => expandable && setOpen(v => !v)}
        className={cn(
          "w-full text-left rounded-md px-3 py-2 transition-colors",
          expandable && "hover:bg-secondary/40 cursor-pointer",
          isSequencePaused && "bg-secondary/30"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            {isPinned && <Pin className="h-2.5 w-2.5 text-foreground/60 shrink-0" />}
            {event.title}
            {(isMeeting && hasMeetingIntel) || (isCall && hasCallIntel) ? (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5 font-medium ml-1">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </Badge>
            ) : null}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {canPin && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onTogglePin(event.activityId!, isPinned); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onTogglePin(event.activityId!, isPinned); } }}
                className={cn(
                  "p-0.5 rounded hover:bg-secondary transition-colors",
                  isPinned ? "text-foreground" : "text-muted-foreground/40 opacity-0 group-hover/row:opacity-100"
                )}
                title={isPinned ? "Unpin" : "Pin to top"}
              >
                {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatTime(event.date)}
            </span>
          </div>
        </div>
        {event.meta && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{event.meta}</p>
        )}

        {/* Sequence-paused pill row */}
        {isSequencePaused && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5 font-medium">
              <PauseCircle className="h-2.5 w-2.5" /> {event.sequenceStep ? `${event.sequenceStep} paused on reply` : "Sequence paused on reply"}
            </Badge>
          </div>
        )}

        {/* Call pill row — outcome + duration */}
        {isCall && (callOutcome || callDurationMin) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {callOutcome && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">{callOutcome}</Badge>
            )}
            {callDurationMin && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">{callDurationMin} min</Badge>
            )}
            {callIntel?.engagement && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">Engagement: {callIntel.engagement}</Badge>
            )}
          </div>
        )}

        {/* Meeting intel pill row */}
        {isMeeting && intel && (intel.engagementLevel || intel.buyerJourney || intel.internalChampionStrength || typeof intel.talkRatio === "number" || intel.questionQuality) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {intel.engagementLevel && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">Engagement: {intel.engagementLevel}</Badge>
            )}
            {intel.buyerJourney && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">Journey: {intel.buyerJourney}</Badge>
            )}
            {intel.internalChampionStrength && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">Champion: {intel.internalChampionStrength}</Badge>
            )}
            {typeof intel.talkRatio === "number" && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium tabular-nums">Talk ratio {Math.round(intel.talkRatio)}%</Badge>
            )}
            {intel.questionQuality && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">Questions: {intel.questionQuality}</Badge>
            )}
          </div>
        )}

        {/* Task pill row — status, source, optional stall reason */}
        {isTask && task && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Badge
              variant="outline"
              className={cn(
                "h-4 text-[9px] px-1.5 gap-0.5 font-medium",
                taskIsOverdue && "border-destructive/40 text-destructive"
              )}
            >
              {taskIsDone ? "Done" : taskIsOverdue ? <><AlertTriangle className="h-2.5 w-2.5" /> Overdue</> : "Upcoming"}
            </Badge>
            <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-medium">
              {taskSourceLabel}
            </Badge>
            {!taskIsDone && stallReason && stallReason.trim() && (
              <span className="text-[10px] text-muted-foreground italic">
                Stall reason: {stallReason}
              </span>
            )}
          </div>
        )}
        {/* Email enrichment pill row — only for email events */}
        {isEmail && email && (opens > 0 || clicks > 0 || replied || aiDrafted || sequence || attachments > 0) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {aiDrafted && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5 font-medium">
                <Sparkles className="h-2.5 w-2.5" /> AI-drafted
              </Badge>
            )}
            {sequence && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 font-mono">
                {sequence}
              </Badge>
            )}
            {opens > 0 && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5" title={`${opens} open${opens !== 1 ? "s" : ""}`}>
                <Eye className="h-2.5 w-2.5" /> Opened {opens}×
              </Badge>
            )}
            {clicks > 0 && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5" title={`${clicks} click${clicks !== 1 ? "s" : ""}`}>
                <MousePointerClick className="h-2.5 w-2.5" /> Clicked {clicks}×
              </Badge>
            )}
            {replied && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5">
                <Reply className="h-2.5 w-2.5" /> Replied
              </Badge>
            )}
            {attachments > 0 && (
              <Badge variant="outline" className="h-4 text-[9px] px-1.5 gap-0.5">
                <Paperclip className="h-2.5 w-2.5" /> {attachments}
              </Badge>
            )}
          </div>
        )}
        {event.detail && !open && (
          <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{event.detail}</p>
        )}
        {event.detail && open && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
            {event.detail}
          </p>
        )}

        {/* Meeting AI extracted intel */}
        {isMeeting && open && hasMeetingIntel && intel && (
          <IntelExtractBlock
            decisions={intel.decisions}
            actionItems={intel.actionItems?.map(a => ({ owner: a.owner, item: a.item, deadline: a.deadline }))}
            nextStep={intel.nextMeetingRecommendation}
          />
        )}

        {/* Call AI extracted intel */}
        {isCall && open && hasCallIntel && callIntel && (
          <IntelExtractBlock
            decisions={callIntel.decisions}
            actionItems={callIntel.actionItems?.map(a => ({
              owner: a.owner,
              item: a.item,
              deadline: a.deadline,
            }))}
            nextStep={callIntel.nextStep}
          />
        )}

        {event.href && open && (
          <a
            href={event.href}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-foreground hover:underline mt-1.5 inline-flex items-center gap-1 mr-3"
          >
            Open recording →
          </a>
        )}

        {/* Open transcript link — meetings with transcript text */}
        {isMeeting && open && meeting?.transcript && onOpenTranscript && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenTranscript(meeting); }}
            className="text-[11px] text-foreground hover:underline mt-1.5 inline-flex items-center gap-1"
          >
            <FileText className="h-3 w-3" /> Open transcript
          </button>
        )}

        {/* Inline Reply for inbound emails */}
        {isEmail && isInbound && onReply && email && open && (
          <div className="mt-2">
            <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1" onClick={handleReply}>
              <Reply className="h-3 w-3" /> Reply
            </Button>
          </div>
        )}
      </button>
    </div>
  );
}

/**
 * Renders an "AI extracted" block under expanded meeting/call rows.
 * Three sections, max 3 items each, sober monochrome styling.
 */
function IntelExtractBlock({
  decisions,
  actionItems,
  nextStep,
}: {
  decisions?: string[];
  actionItems?: { owner?: string; item: string; deadline?: string }[];
  nextStep?: string;
}) {
  const dec = (decisions || []).filter(Boolean).slice(0, 3);
  const items = (actionItems || []).filter(a => a && a.item).slice(0, 3);
  if (dec.length === 0 && items.length === 0 && !nextStep) return null;
  return (
    <div className="mt-2 rounded border border-border bg-secondary/30 p-2 space-y-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Sparkles className="h-2.5 w-2.5" /> AI extracted
      </p>
      {dec.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-foreground/80">Decisions</p>
          <ul className="mt-0.5 space-y-0.5">
            {dec.map((d, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-snug">• {d}</li>
            ))}
          </ul>
        </div>
      )}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-foreground/80">Action items</p>
          <ul className="mt-0.5 space-y-0.5">
            {items.map((a, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1">
                <span>•</span>
                <span className="flex-1">
                  {a.owner && (
                    <Badge variant="outline" className="h-3.5 text-[8px] px-1 mr-1 font-medium uppercase">{a.owner}</Badge>
                  )}
                  {a.item}
                  {a.deadline && <span className="text-muted-foreground/60"> · {a.deadline}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {nextStep && (
        <div>
          <p className="text-[10px] font-medium text-foreground/80">Recommended next step</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{nextStep}</p>
        </div>
      )}
    </div>
  );
}

