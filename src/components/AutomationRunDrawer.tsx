import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Clock, Zap, ArrowRight, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format, formatDistanceStrict } from "date-fns";

/**
 * Live drawer that opens the moment you click ▷ on any automation row.
 *
 * Streams three signals in real time:
 *   1. cron_run_log INSERTs filtered by job_name (heartbeats + final summary)
 *   2. fireflies_retry_queue UPDATEs (per-lead status flips for the backfill drainer)
 *   3. The invoke() promise resolution (final return payload, or "killed by gateway")
 *
 * Persists the last-completed run per-job in localStorage so reopening shows
 * the most recent result instantly instead of a blank canvas.
 */

export interface RunInvocation {
  jobName: string;       // cron_run_log.job_name (e.g. "process-fireflies-backfill-queue")
  endpoint: string;      // edge function name to invoke (e.g. "process-fireflies-backfill-queue")
  label: string;         // human-readable name shown in the header
  body: Record<string, unknown>;
  // Some rows invoke a different endpoint than their job_name (e.g. "Drain" on
  // enqueue-fireflies-backfill actually fires process-fireflies-backfill-queue).
  // When that's the case, listen on this job_name for log events instead.
  logJobName?: string;
}

type EventKind = "invoke" | "heartbeat" | "item" | "final" | "error" | "info";

interface StreamEvent {
  ts: number;
  kind: EventKind;
  message: string;
  meta?: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  invocation: RunInvocation | null;
}

interface PersistedSnapshot {
  startedAt: number;
  endedAt: number;
  status: "done" | "errored" | "killed";
  events: StreamEvent[];
  finalPayload?: Record<string, unknown> | null;
}

const STORAGE_PREFIX = "lov.runDrawer.lastRun.";

export function AutomationRunDrawer({ open, onClose, invocation }: Props) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "errored" | "killed">("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalPayload, setFinalPayload] = useState<Record<string, unknown> | null>(null);
  const [restoredFromCache, setRestoredFromCache] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [backlog, setBacklog] = useState<{ pending: number; gaveUp: number; done: number } | null>(null);
  // Track which lead IDs were touched in *this* drawer session (for the "Show me…" filter buttons).
  const sessionLeadIdsRef = useRef<{ recovered: Set<string>; gaveUp: Set<string> }>({
    recovered: new Set(),
    gaveUp: new Set(),
  });
  const [sessionTouched, setSessionTouched] = useState({ recovered: 0, gaveUp: 0 });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const invocationKey = invocation ? `${invocation.endpoint}:${invocation.jobName}` : null;

  // Reset state and kick off invocation each time the drawer opens with a new invocation.
  useEffect(() => {
    if (!open || !invocation) return;
    let cancelled = false;
    const start = Date.now();

    // Hydrate cached snapshot first (instant feedback even before the new run produces data).
    const cached = readSnapshot(invocation.jobName);
    if (cached) {
      setEvents(cached.events);
      setFinalPayload(cached.finalPayload ?? null);
      setRestoredFromCache(true);
    } else {
      setEvents([]);
      setFinalPayload(null);
      setRestoredFromCache(false);
    }

    setStatus("running");
    setStartedAt(start);
    setElapsed(0);
    setProgress(null);
    setBacklog(null);
    sessionLeadIdsRef.current = { recovered: new Set(), gaveUp: new Set() };
    setSessionTouched({ recovered: 0, gaveUp: 0 });

    pushEvent(setEvents, {
      ts: start,
      kind: "invoke",
      message: `Invoked ${invocation.endpoint}`,
      meta: invocation.body,
    });

    // Snapshot live backlog counts for backfill jobs so the user has a baseline.
    const isBackfill = invocation.jobName === "process-fireflies-backfill-queue"
      || invocation.endpoint === "process-fireflies-backfill-queue";
    if (isBackfill) {
      void hydrateBacklog(setBacklog, setEvents, start);
    }

    // Fire the invocation (don't await — drawer streams while it's in flight).
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(invocation.endpoint, { body: invocation.body });
        if (cancelled) return;
        if (error) throw error;
        const payload = (data ?? {}) as Record<string, unknown>;
        setFinalPayload(payload);
        setStatus("done");
        pushEvent(setEvents, {
          ts: Date.now(),
          kind: "final",
          message: summarizePayload(invocation.endpoint, payload),
          meta: payload,
        });
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message || "Unknown error";
        const lower = msg.toLowerCase();
        const killed = lower.includes("context canceled")
          || lower.includes("idle_timeout")
          || lower.includes("idle timeout")
          || lower.includes("504")
          || lower.includes("connection closed");
        if (killed) {
          setStatus("killed");
          pushEvent(setEvents, {
            ts: Date.now(),
            kind: "info",
            message: "Edge gateway killed the request after ~150s. Database commits already shown above are safe — the next cron tick will continue from where this stopped.",
          });
        } else {
          setStatus("errored");
          pushEvent(setEvents, { ts: Date.now(), kind: "error", message: msg });
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invocationKey]);

  // Persist snapshot whenever a run completes.
  useEffect(() => {
    if (!invocation) return;
    if (status !== "done" && status !== "errored" && status !== "killed") return;
    if (!startedAt) return;
    writeSnapshot(invocation.jobName, {
      startedAt,
      endedAt: Date.now(),
      status: status === "done" ? "done" : status === "errored" ? "errored" : "killed",
      events,
      finalPayload,
    });
  }, [status, startedAt, events, finalPayload, invocation]);

  // Live elapsed counter while running.
  useEffect(() => {
    if (status !== "running" || !startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(id);
  }, [status, startedAt]);

  // Auto-scroll to newest event.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length]);

  // Realtime subscription: cron_run_log INSERTs for this job.
  useEffect(() => {
    if (!open || !invocation) return;
    const targetJobNames = [invocation.jobName];
    if (invocation.logJobName && invocation.logJobName !== invocation.jobName) {
      targetJobNames.push(invocation.logJobName);
    }
    const channel = supabase
      .channel(`run-drawer-cron-${invocation.jobName}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cron_run_log" },
        (payload) => {
          const row = payload.new as any;
          if (!targetJobNames.includes(row?.job_name)) return;
          const details = (row?.details ?? {}) as Record<string, unknown>;
          const ts = row?.ran_at ? new Date(row.ran_at).getTime() : Date.now();
          if (details.heartbeat) {
            pushEvent(setEvents, {
              ts,
              kind: "heartbeat",
              message: `Heartbeat logged · claimed ${details.claimed ?? 0} row(s)`,
              meta: details,
            });
            if (typeof details.claimed === "number") {
              setProgress({ done: 0, total: Number(details.claimed) });
            }
          } else if (details.item) {
            pushEvent(setEvents, {
              ts,
              kind: "item",
              message: `${details.item} · ${details.classification ?? "processed"}`,
              meta: details,
            });
            setProgress(p => p ? { ...p, done: Math.min(p.total, p.done + 1) } : null);
          } else {
            // Final summary row.
            const status = String(row?.status ?? "");
            pushEvent(setEvents, {
              ts,
              kind: status === "error" ? "error" : "final",
              message: `Finalized · status=${status} · items=${row?.items_processed ?? 0}`,
              meta: { ...details, error: row?.error_message },
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fireflies_retry_queue" },
        (payload) => {
          const row = payload.new as any;
          const old = payload.old as any;
          if (!row?.fireflies_id?.startsWith?.("backfill:")) return;
          if (row?.status === old?.status) return; // only emit on status flips
          pushEvent(setEvents, {
            ts: row?.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
            kind: "item",
            message: `Lead ${shortId(row.lead_id)} → ${row.status}${row.last_error ? ` (${row.last_error})` : ""}`,
            meta: { lead_id: row.lead_id, status: row.status, error: row.last_error },
          });
          setProgress(p => p ? { ...p, done: Math.min(p.total, p.done + 1) } : null);
          // Track session-touched lead IDs for the "Show me…" filter buttons.
          if (row.lead_id) {
            if (row.status === "done") sessionLeadIdsRef.current.recovered.add(String(row.lead_id));
            else if (row.status === "gave_up") sessionLeadIdsRef.current.gaveUp.add(String(row.lead_id));
            setSessionTouched({
              recovered: sessionLeadIdsRef.current.recovered.size,
              gaveUp: sessionLeadIdsRef.current.gaveUp.size,
            });
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [open, invocation]);

  // Polling fallback (3s) — guarantees event flow even if Realtime channel drops.
  // Pulls cron_run_log rows for this job since the drawer opened; pushEvent dedupes by message+ts.
  useEffect(() => {
    if (!open || !invocation || status !== "running" || !startedAt) return;
    const targetJobNames = invocation.logJobName && invocation.logJobName !== invocation.jobName
      ? [invocation.jobName, invocation.logJobName]
      : [invocation.jobName];
    const sinceIso = new Date(startedAt - 1000).toISOString();
    let cancelled = false;

    const tick = async () => {
      try {
        const { data, error } = await supabase
          .from("cron_run_log")
          .select("id,job_name,status,items_processed,error_message,details,ran_at")
          .in("job_name", targetJobNames)
          .gte("ran_at", sinceIso)
          .order("ran_at", { ascending: true })
          .limit(200);
        if (cancelled || error || !data) return;
        for (const row of data as any[]) {
          const details = (row?.details ?? {}) as Record<string, unknown>;
          const ts = row?.ran_at ? new Date(row.ran_at).getTime() : Date.now();
          if (details.heartbeat) {
            pushEvent(setEvents, {
              ts,
              kind: "heartbeat",
              message: `Heartbeat logged · claimed ${details.claimed ?? 0} row(s)`,
              meta: details,
            });
          } else if (details.item) {
            pushEvent(setEvents, {
              ts,
              kind: "item",
              message: `${details.item} · ${details.classification ?? "processed"}`,
              meta: details,
            });
          } else {
            pushEvent(setEvents, {
              ts,
              kind: row?.status === "error" ? "error" : "final",
              message: `Finalized · status=${row?.status} · items=${row?.items_processed ?? 0}`,
              meta: { ...details, error: row?.error_message },
            });
          }
        }
      } catch { /* ignore — Realtime is primary */ }
    };

    void tick(); // immediate first poll
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open, invocation, status, startedAt]);

  // Refresh backlog snapshot when the run finishes for backfill jobs (so the Final Results panel is current).
  useEffect(() => {
    if (!invocation) return;
    if (status !== "done" && status !== "killed" && status !== "errored") return;
    const isBackfill = invocation.jobName === "process-fireflies-backfill-queue"
      || invocation.endpoint === "process-fireflies-backfill-queue";
    if (!isBackfill) return;
    void hydrateBacklog(setBacklog, () => {}, Date.now()); // refresh silently (no event row)
  }, [status, invocation]);

  const headerStatus = useMemo(() => {
    switch (status) {
      case "running": return { label: "LIVE", tone: "running" as const };
      case "done":    return { label: "DONE", tone: "done" as const };
      case "errored": return { label: "ERROR", tone: "error" as const };
      case "killed":  return { label: "GATEWAY KILL", tone: "killed" as const };
      default:        return { label: "IDLE", tone: "idle" as const };
    }
  }, [status]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border space-y-2">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              {invocation?.label ?? "Automation run"}
            </SheetTitle>
            <StatusPill tone={headerStatus.tone} label={headerStatus.label} />
          </div>
          <SheetDescription className="text-xs text-muted-foreground tabular-nums flex items-center gap-3">
            {startedAt ? (
              <>
                <span>Started {format(startedAt, "HH:mm:ss")}</span>
                <span>·</span>
                <span>
                  {status === "running"
                    ? `${Math.floor(elapsed / 1000)}s elapsed`
                    : `ran ${formatDistanceStrict(startedAt, startedAt + (elapsed || 1))}`}
                </span>
                {restoredFromCache && (
                  <>
                    <span>·</span>
                    <span className="text-foreground/60">previous run restored from cache</span>
                  </>
                )}
              </>
            ) : (
              <span>Awaiting invoke…</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-4 space-y-4 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Progress</div>
            {progress ? (
              <div className="space-y-1.5">
                <Progress value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
                <div className="text-xs text-foreground/80 tabular-nums">
                  {progress.done} / {progress.total} this tick
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {status === "running" ? "Waiting for first heartbeat…" : "No batch tracking for this job."}
              </div>
            )}
            {backlog && (
              <div className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                Backlog: {backlog.pending} pending · {backlog.gaveUp} gave up · {backlog.done} done
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 px-6 py-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Live event stream</div>
          <ScrollArea className="h-full pr-3" >
            <div ref={scrollRef} className="space-y-1.5 max-h-[calc(100vh-380px)] overflow-y-auto">
              {events.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No events yet.</div>
              )}
              {events.map((ev, i) => (
                <EventRow key={i} ev={ev} />
              ))}
            </div>
          </ScrollArea>
        </div>

        {finalPayload && (
          <div className="px-6 py-3 border-t border-border bg-secondary/30">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Final result</div>
            <pre className="text-[11px] font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {JSON.stringify(finalPayload, null, 2)}
            </pre>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EventRow({ ev }: { ev: StreamEvent }) {
  const { Icon, tone } = iconFor(ev.kind);
  return (
    <div className="flex items-start gap-2.5 text-xs leading-relaxed">
      <span className="text-[10px] tabular-nums text-muted-foreground mt-0.5 w-14 shrink-0">
        {format(ev.ts, "HH:mm:ss")}
      </span>
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", tone)} />
      <span className="text-foreground/90 break-words">{ev.message}</span>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: "running" | "done" | "error" | "killed" | "idle"; label: string }) {
  const dot = tone === "running" ? "bg-foreground animate-pulse"
    : tone === "done"    ? "bg-foreground/60"
    : tone === "error"   ? "bg-foreground"
    : tone === "killed"  ? "bg-foreground/60"
    : "bg-foreground/30";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] tracking-wider font-medium text-foreground/80 px-2 py-1 rounded-md border border-border bg-secondary/40">
      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

function iconFor(kind: EventKind): { Icon: typeof Loader2; tone: string } {
  switch (kind) {
    case "invoke":    return { Icon: ArrowRight, tone: "text-foreground/60" };
    case "heartbeat": return { Icon: Loader2, tone: "text-foreground/60" };
    case "item":      return { Icon: CheckCircle2, tone: "text-foreground/60" };
    case "final":     return { Icon: CheckCircle2, tone: "text-foreground" };
    case "error":     return { Icon: AlertTriangle, tone: "text-foreground" };
    case "info":      return { Icon: Clock, tone: "text-foreground/60" };
    default:          return { Icon: Clock, tone: "text-muted-foreground" };
  }
}

function pushEvent(setter: (fn: (prev: StreamEvent[]) => StreamEvent[]) => void, ev: StreamEvent) {
  setter(prev => {
    // De-dupe by message+ts within 1s window to avoid duplicate streams.
    const dupe = prev.find(p => p.message === ev.message && Math.abs(p.ts - ev.ts) < 1000);
    if (dupe) return prev;
    return [...prev, ev].slice(-200);
  });
}

function shortId(id: string | undefined | null): string {
  if (!id) return "?";
  return String(id).slice(0, 8);
}

function summarizePayload(endpoint: string, data: Record<string, unknown>): string {
  if (endpoint === "process-fireflies-backfill-queue") {
    const processed = (data.processed as number) ?? 0;
    const recovered = (data.recovered as number) ?? 0;
    const gaveUp = (data.gaveUp as number) ?? 0;
    return `Function returned: processed ${processed} · recovered ${recovered} · gave up ${gaveUp}`;
  }
  if (endpoint === "process-fireflies-retry-queue") {
    const processed = (data.processed as number) ?? 0;
    const recovered = (data.recovered as number) ?? 0;
    return `Function returned: processed ${processed} · recovered ${recovered}`;
  }
  if (endpoint === "enqueue-fireflies-backfill") {
    return `Function returned: scanned ${data.scanned ?? 0} · enqueued ${data.enqueued ?? 0} · skipped ${data.skipped_existing ?? 0}`;
  }
  const parts: string[] = [];
  for (const k of ["processed", "items_processed", "inserted", "matched", "skipped", "recovered"]) {
    const v = data[k];
    if (typeof v === "number") parts.push(`${k} ${v}`);
  }
  if (parts.length) return `Function returned: ${parts.join(" · ")}`;
  return "Function returned successfully";
}

async function hydrateBacklog(
  setBacklog: (b: { pending: number; gaveUp: number; done: number }) => void,
  setEvents: (fn: (prev: StreamEvent[]) => StreamEvent[]) => void,
  ts: number,
) {
  const counts = await Promise.all([
    supabase.from("fireflies_retry_queue").select("id", { count: "exact", head: true })
      .like("fireflies_id", "backfill:%").eq("status", "pending"),
    supabase.from("fireflies_retry_queue").select("id", { count: "exact", head: true })
      .like("fireflies_id", "backfill:%").eq("status", "gave_up"),
    supabase.from("fireflies_retry_queue").select("id", { count: "exact", head: true })
      .like("fireflies_id", "backfill:%").eq("status", "done"),
  ]);
  const backlog = {
    pending: counts[0].count ?? 0,
    gaveUp: counts[1].count ?? 0,
    done: counts[2].count ?? 0,
  };
  setBacklog(backlog);
  pushEvent(setEvents, {
    ts,
    kind: "info",
    message: `Backlog snapshot: ${backlog.pending} pending · ${backlog.gaveUp} gave up · ${backlog.done} done`,
  });
}

function readSnapshot(jobName: string): PersistedSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + jobName);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSnapshot;
  } catch { return null; }
}

function writeSnapshot(jobName: string, snap: PersistedSnapshot) {
  try {
    localStorage.setItem(STORAGE_PREFIX + jobName, JSON.stringify(snap));
  } catch { /* quota exceeded — ignore */ }
}
