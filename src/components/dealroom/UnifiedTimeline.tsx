import { useEffect, useMemo, useState } from "react";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { ActivityLogEntry, fetchActivityLog } from "@/lib/activityLog";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type FilterKey = "all" | "emails" | "meetings" | "stage" | "notes" | "system" | "pinned";
type DateRange = "all" | "7d" | "30d" | "90d";

interface TimelineEvent {
  id: string;
  type: "stage_change" | "meeting" | "email_in" | "email_out" | "calendly" | "submission" | "note" | "system";
  date: string;
  title: string;
  detail?: string;
  meta?: string;
  href?: string;
  /** present when the event is backed by a row in lead_activity_log and can be pinned */
  activityId?: string;
  pinnedAt?: string | null;
}

interface EmailRow {
  id: string;
  direction: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  subject: string | null;
  body_preview: string | null;
  email_date: string;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "emails", label: "Emails" },
  { key: "meetings", label: "Meetings" },
  { key: "stage", label: "Stage" },
  { key: "notes", label: "Notes" },
  { key: "system", label: "System" },
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
  if (f === "emails") return e.type === "email_in" || e.type === "email_out";
  if (f === "meetings") return e.type === "meeting" || e.type === "calendly";
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

export function UnifiedTimeline({ lead }: { lead: Lead }) {
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>("all");
  const [loading, setLoading] = useState(true);
  // Toggle to expand/collapse all detail bodies at once
  const [expandAllNonce, setExpandAllNonce] = useState(0);
  const [forcedOpen, setForcedOpen] = useState<boolean | null>(null);

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
        .select("id,direction,from_address,from_name,to_addresses,subject,body_preview,email_date")
        .eq("lead_id", lead.id)
        .order("email_date", { ascending: false })
        .limit(200),
    ]).then(([log, emailRes]) => {
      if (cancelled) return;
      setActivity(log);
      setEmails((emailRes.data as unknown as EmailRow[]) || []);
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

    // Activity log (stage changes, field updates, notes) — these can be pinned
    activity.forEach(a => {
      const actor = (a as any).actor_name as string | undefined;
      out.push({
        id: `act-${a.id}`,
        activityId: a.id,
        pinnedAt: (a as any).pinned_at || null,
        type: a.event_type === "stage_change" ? "stage_change"
          : a.event_type === "note_added" ? "note"
          : a.event_type === "meeting_added" ? "meeting"
          : "system",
        date: a.created_at,
        title: a.description,
        meta: actor && actor.trim() ? `by ${actor}` : "by System",
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
  }, [activity, emails, lead]);

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
    emails: events.filter(e => e.type === "email_in" || e.type === "email_out").length,
    meetings: events.filter(e => e.type === "meeting" || e.type === "calendly").length,
    stage: events.filter(e => e.type === "stage_change").length,
    notes: events.filter(e => e.type === "note").length,
    system: events.filter(e => e.type === "submission" || e.type === "system").length,
    pinned: events.filter(e => e.pinnedAt).length,
  }), [events]);

  const toggleAll = (open: boolean) => {
    setForcedOpen(open);
    setExpandAllNonce(n => n + 1);
  };

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
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  event,
  onTogglePin,
  forcedOpen,
  forceNonce,
}: {
  event: TimelineEvent;
  onTogglePin: (id: string, currentlyPinned: boolean) => void;
  forcedOpen: boolean | null;
  forceNonce: number;
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!event.detail;

  // React to expand-all / collapse-all toggle from parent
  useEffect(() => {
    if (forcedOpen === null) return;
    setOpen(forcedOpen && expandable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceNonce]);

  const canPin = !!event.activityId;
  const isPinned = !!event.pinnedAt;

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
          expandable && "hover:bg-secondary/40 cursor-pointer"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            {isPinned && <Pin className="h-2.5 w-2.5 text-foreground/60 shrink-0" />}
            {event.title}
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
        {event.detail && !open && (
          <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">{event.detail}</p>
        )}
        {event.detail && open && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
            {event.detail}
          </p>
        )}
        {event.href && open && (
          <a
            href={event.href}
            target="_blank"
            rel="noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-[11px] text-foreground hover:underline mt-1.5 inline-block"
          >
            Open recording →
          </a>
        )}
      </button>
    </div>
  );
}
