import { useEffect, useState, useMemo } from "react";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STAGES, normalizeStage, isClosedStage, computeDaysInStage } from "@/lib/leadUtils";
import { computeDealHealthScore } from "@/lib/dealHealthUtils";
import { useEmailHealthFactors } from "@/lib/emailSignals";
import { Pin, Mail, Calendar, CheckSquare, TrendingUp, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { EmailHighlightsCard } from "@/components/lead-panel/cards/EmailHighlightsCard";

interface Props {
  lead: Lead;
}

interface Touchpoints {
  total: number;
  lastDate: string | null;
}

interface PinnedNote {
  id: string;
  description: string;
  created_at: string;
  actor_name: string | null;
}

interface UpcomingTask {
  id: string;
  title: string;
  due_date: string;
  task_type: string;
}

function formatDeal(value: number): string {
  if (!value) return "—";
  if (value >= 1000) return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return `$${value}`;
}

export function LeadOverviewTab({ lead }: Props) {
  const [touch, setTouch] = useState<Touchpoints>({ total: 0, lastDate: null });
  const [pinned, setPinned] = useState<PinnedNote | null>(null);
  const [tasks, setTasks] = useState<UpcomingTask[]>([]);

  // Fetch touchpoints (emails + meetings + calls via activity log)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [emailsRes, pinnedRes, tasksRes] = await Promise.all([
        supabase
          .from("lead_emails")
          .select("id, email_date", { count: "exact" })
          .eq("lead_id", lead.id)
          .order("email_date", { ascending: false })
          .limit(1),
        (supabase as any)
          .from("lead_activity_log")
          .select("id, description, created_at, actor_name")
          .eq("lead_id", lead.id)
          .eq("event_type", "note_added")
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
          .limit(1),
        supabase
          .from("lead_tasks")
          .select("id, title, due_date, task_type")
          .eq("lead_id", lead.id)
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .limit(2),
      ]);
      if (cancelled) return;
      const emailCount = emailsRes.count ?? 0;
      const lastEmail = emailsRes.data?.[0]?.email_date ?? null;
      const meetingCount = (lead.meetings || []).length;
      const lastMeeting = (lead.meetings || [])[0]?.date ?? null;
      const lastContact = [lastEmail, lastMeeting, lead.lastContactDate]
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null;
      setTouch({ total: emailCount + meetingCount, lastDate: lastContact });
      setPinned((pinnedRes.data?.[0] as PinnedNote) ?? null);
      setTasks((tasksRes.data as UpcomingTask[]) || []);
    })();
    return () => { cancelled = true; };
  }, [lead.id, lead.meetings, lead.lastContactDate]);

  const normalized = normalizeStage(lead.stage);
  const stageIdx = ACTIVE_STAGES.indexOf(normalized);
  const stageLabel = stageIdx >= 0 ? `${stageIdx + 1}/${ACTIVE_STAGES.length}` : "—";
  const daysInStage = computeDaysInStage(lead.stageEnteredDate);

  const health = useMemo(() => computeDealHealthScore(lead), [lead]);
  const forecastPct = useMemo(() => {
    const f = lead.forecastCategory?.toLowerCase();
    if (f === "commit") return 90;
    if (f === "best case") return 60;
    if (f === "pipeline") return 30;
    if (f === "omitted") return 0;
    return null;
  }, [lead.forecastCategory]);

  const lastContactLabel = touch.lastDate
    ? formatDistanceToNow(new Date(touch.lastDate), { addSuffix: true })
    : "No contact yet";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {/* 4 Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Stage"
          value={isClosedStage(normalized) ? normalized : stageLabel}
          sub={isClosedStage(normalized) ? `closed ${daysInStage}d ago` : `${daysInStage}d in ${normalized}`}
        />
        <StatCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Deal Value"
          value={formatDeal(lead.dealValue || 0)}
          sub={forecastPct != null ? `forecast ${forecastPct}%` : lead.forecastCategory || "—"}
        />
        <StatCard
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Deal Health"
          value={health ? `${health.score}` : "—"}
          sub={health?.label || "Run enrichment"}
          tone={health?.color === "red" ? "warn" : health?.color === "amber" ? "muted" : "default"}
        />
        <StatCard
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Touchpoints"
          value={String(touch.total)}
          sub={lastContactLabel}
        />
      </div>

      {/* Pinned note banner */}
      {pinned && (
        <div className="border border-border rounded-md bg-secondary/30 px-3 py-2 flex items-start gap-2">
          <Pin className="h-3.5 w-3.5 text-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Pinned note {pinned.actor_name ? `· ${pinned.actor_name}` : ""}
            </div>
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap line-clamp-3">
              {pinned.description}
            </p>
          </div>
        </div>
      )}

      {/* Upcoming tasks */}
      <div className="border border-border rounded-md">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Upcoming tasks</span>
          {tasks.length > 0 && (
            <span className="text-[10px] text-muted-foreground">({tasks.length})</span>
          )}
        </div>
        {tasks.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No pending tasks.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((t) => {
              const due = new Date(t.due_date);
              const overdue = due < new Date();
              return (
                <li key={t.id} className="px-3 py-2 flex items-center gap-2">
                  <Calendar className={cn("h-3 w-3 shrink-0", overdue ? "text-destructive" : "text-muted-foreground")} />
                  <span className="text-xs flex-1 min-w-0 truncate">{t.title}</span>
                  <span className={cn("text-[10px] shrink-0", overdue ? "text-destructive" : "text-muted-foreground")}>
                    {overdue ? "Overdue · " : ""}{format(due, "MMM d")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "muted" | "warn";
}) {
  return (
    <div className="border border-border rounded-md px-3 py-2.5 bg-background">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn(
        "text-lg font-semibold leading-tight",
        tone === "warn" && "text-destructive",
        tone === "muted" && "text-muted-foreground",
      )}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}
