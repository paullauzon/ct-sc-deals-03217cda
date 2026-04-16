import { useEffect, useMemo, useState } from "react";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { ActivityLogEntry, fetchActivityLog } from "@/lib/activityLog";
import {
  Calendar,
  Mail,
  GitCommit,
  MessageSquare,
  CalendarCheck,
  FileInput,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "emails" | "meetings" | "stage" | "notes" | "system";

interface TimelineEvent {
  id: string;
  type: "stage_change" | "meeting" | "email_in" | "email_out" | "calendly" | "submission" | "note" | "system";
  date: string;
  title: string;
  detail?: string;
  meta?: string;
  href?: string;
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
];

function eventMatchesFilter(e: TimelineEvent, f: FilterKey): boolean {
  if (f === "all") return true;
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
  const [loading, setLoading] = useState(true);

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

  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = [];

    // Activity log (stage changes, field updates, notes)
    activity.forEach(a => {
      out.push({
        id: `act-${a.id}`,
        type: a.event_type === "stage_change" ? "stage_change"
          : a.event_type === "note_added" ? "note"
          : a.event_type === "meeting_added" ? "meeting"
          : "system",
        date: a.created_at,
        title: a.description,
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

  const filtered = events.filter(e => eventMatchesFilter(e, filter));

  // Group by month
  const groups = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    filtered.forEach(e => {
      const k = monthKey(e.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const counts = useMemo(() => ({
    all: events.length,
    emails: events.filter(e => e.type === "email_in" || e.type === "email_out").length,
    meetings: events.filter(e => e.type === "meeting" || e.type === "calendly").length,
    stage: events.filter(e => e.type === "stage_change").length,
    notes: events.filter(e => e.type === "note").length,
    system: events.filter(e => e.type === "submission" || e.type === "system").length,
  }), [events]);

  return (
    <div className="space-y-4">
      {/* Filter chips */}
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

      {loading ? (
        <p className="text-xs text-muted-foreground/60 text-center py-12">Loading activity…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 text-center py-12">No activity in this view yet</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([month, items]) => (
            <div key={month}>
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-1.5 mb-2 z-10">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {month}
                </h3>
              </div>
              <div className="relative">
                {/* Vertical rail */}
                <div className="absolute left-[13px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-1">
                  {items.map(ev => (
                    <TimelineRow key={ev.id} event={ev} />
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

function TimelineRow({ event }: { event: TimelineEvent }) {
  const [open, setOpen] = useState(false);
  const expandable = !!event.detail;

  return (
    <div className="relative pl-9">
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
          <p className="text-sm font-medium truncate">{event.title}</p>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {formatTime(event.date)}
          </span>
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
