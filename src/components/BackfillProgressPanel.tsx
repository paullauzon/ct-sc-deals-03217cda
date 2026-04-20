// Backfill control + live progress panel.
// Lets the user pick a window (90d / 1y / 3y / All time), kicks off a job,
// then polls the email_backfill_jobs row + queue counts every 5s while a job
// is running. Safe to close the tab — the job runs server-side via
// backfill-discover + backfill-hydrate (cron-driven).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, ChevronDown, History, Pause, Play, X,
  CheckCircle2, AlertCircle, DownloadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Window = "90d" | "1y" | "3y" | "all";

interface Job {
  id: string;
  connection_id: string;
  provider: string;
  email_address: string;
  target_window: string;
  status: string;
  estimated_total: number;
  messages_discovered: number;
  messages_processed: number;
  messages_inserted: number;
  messages_matched: number;
  messages_skipped: number;
  discovery_complete: boolean;
  last_error: string | null;
  started_at: string;
  finished_at: string | null;
  last_chunked_at: string | null;
}

const WINDOW_LABELS: Record<Window, string> = {
  "90d": "Last 90 days",
  "1y": "Last 1 year",
  "3y": "Last 3 years",
  "all": "All time",
};

interface Props {
  connectionId: string;
  emailAddress: string;
  provider: string;
}

export function BackfillProgressPanel({ connectionId, emailAddress, provider }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingWindow, setPendingWindow] = useState<Window>("90d");
  const [starting, setStarting] = useState(false);
  const [actioning, setActioning] = useState(false);

  const loadJob = async () => {
    const { data } = await supabase
      .from("email_backfill_jobs")
      .select("*")
      .eq("connection_id", connectionId)
      .not("status", "eq", "superseded")
      .order("started_at", { ascending: false })
      .limit(1);
    const latest = ((data || [])[0] as Job) || null;
    setJob(latest);
    setLoading(false);

    // Issue 1: auto-enroll active connections that never had a backfill job.
    // Guarded by localStorage so it only fires once per connection across refreshes.
    if (!latest) {
      const enrollKey = `backfill-auto-enrolled-${connectionId}`;
      if (!localStorage.getItem(enrollKey)) {
        localStorage.setItem(enrollKey, new Date().toISOString());
        try {
          const { data: started, error } = await supabase.functions.invoke("start-email-backfill", {
            body: { connection_id: connectionId, target_window: "90d" },
          });
          if (error || !started?.ok) throw new Error(error?.message || started?.error || "auto-enroll failed");
          toast.success("Importing your last 90 days in the background", { duration: 6000 });
          setTimeout(() => {
            supabase
              .from("email_backfill_jobs")
              .select("*")
              .eq("connection_id", connectionId)
              .not("status", "eq", "superseded")
              .order("started_at", { ascending: false })
              .limit(1)
              .then(({ data: d2 }) => setJob(((d2 || [])[0] as Job) || null));
          }, 1000);
        } catch {
          // Clear the guard so a future open retries — silent fail is fine.
          localStorage.removeItem(enrollKey);
        }
      }
    }
  };

  useEffect(() => {
    loadJob();
  }, [connectionId]);

  // Poll while a job is active
  useEffect(() => {
    if (!job) return;
    const isActive = ["queued", "discovering", "running"].includes(job.status);
    if (!isActive) return;
    const t = setInterval(loadJob, 5000);
    return () => clearInterval(t);
  }, [job?.status, connectionId]);

  const isActive = job && ["queued", "discovering", "running"].includes(job.status);
  const isPaused = job?.status === "paused";
  const isDone = job?.status === "done";
  const isFailed = job?.status === "failed";
  const isCancelled = job?.status === "cancelled";

  const progressPct = useMemo(() => {
    if (!job) return 0;
    const total = Math.max(job.messages_discovered, job.estimated_total, 1);
    return Math.min(100, Math.round((job.messages_processed / total) * 100));
  }, [job]);

  const startBackfill = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("start-email-backfill", {
        body: { connection_id: connectionId, target_window: pendingWindow },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to start backfill");
      toast.success("Backfill started — running in background, safe to close this tab", { duration: 6000 });
      setConfirmOpen(false);
      setTimeout(loadJob, 1000);
    } catch (e: any) {
      toast.error(e.message || "Failed to start backfill");
    } finally {
      setStarting(false);
    }
  };

  const setStatus = async (status: "paused" | "running" | "cancelled") => {
    if (!job) return;
    setActioning(true);
    try {
      const updates: { status: string; finished_at?: string } = { status };
      if (status === "cancelled") updates.finished_at = new Date().toISOString();
      const { error } = await supabase.from("email_backfill_jobs").update(updates).eq("id", job.id);
      if (error) throw error;
      if (status === "running") {
        // Resume — kick the hydrate worker immediately
        await supabase.functions.invoke("backfill-hydrate", { body: { job_id: job.id } });
        toast.success("Backfill resumed");
      } else if (status === "paused") {
        toast.success("Backfill paused");
      } else {
        toast.success("Backfill cancelled");
      }
      loadJob();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActioning(false);
    }
  };

  const renderStatusLabel = () => {
    if (!job) return null;
    switch (job.status) {
      case "queued":
      case "discovering": return "Discovering messages…";
      case "running": return job.discovery_complete ? "Hydrating…" : "Discovering + hydrating…";
      case "paused": return "Paused";
      case "done": return "Complete";
      case "failed": return "Failed";
      case "cancelled": return "Cancelled";
      default: return job.status;
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading backfill…
      </div>
    );
  }

  // No job yet, or last job is finished and user can start a new one
  const canStart = !job || ["done", "failed", "cancelled"].includes(job.status);

  return (
    <div className="space-y-2 text-xs">
      {job && !canStart && (
        <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">
                Backfill — {WINDOW_LABELS[job.target_window as Window] || job.target_window}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {renderStatusLabel()} · started {formatDistanceToNow(new Date(job.started_at), { addSuffix: true })}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isActive && (
                <Button size="sm" variant="ghost" className="h-7 px-2"
                  onClick={() => setStatus("paused")} disabled={actioning}>
                  <Pause className="h-3 w-3 mr-1" /> Pause
                </Button>
              )}
              {isPaused && (
                <Button size="sm" variant="ghost" className="h-7 px-2"
                  onClick={() => setStatus("running")} disabled={actioning}>
                  <Play className="h-3 w-3 mr-1" /> Resume
                </Button>
              )}
              {(isActive || isPaused) && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                  onClick={() => {
                    if (window.confirm("Cancel this backfill? Already-imported messages will stay; pending messages will be skipped.")) {
                      setStatus("cancelled");
                    }
                  }}
                  disabled={actioning}>
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
              )}
            </div>
          </div>

          <Progress value={progressPct} className="h-1.5" />

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <div>
              <span className="text-foreground font-medium">{job.messages_processed.toLocaleString()}</span>
              {" / "}
              <span>{(job.messages_discovered || job.estimated_total || 0).toLocaleString()}</span>
              {" "}({progressPct}%)
            </div>
            <div>
              <span className="text-foreground font-medium">{job.messages_inserted.toLocaleString()}</span> inserted ·{" "}
              <span className="text-foreground font-medium">{job.messages_matched.toLocaleString()}</span> matched ·{" "}
              {Math.max(0, job.messages_inserted - job.messages_matched).toLocaleString()} unmatched
            </div>
          </div>

          {job.last_error && (
            <div className="text-[11px] text-foreground inline-flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{job.last_error}</span>
            </div>
          )}
        </div>
      )}

      {canStart && (
        <div className="flex items-center gap-2">
          {job && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              {isDone && <CheckCircle2 className="h-3 w-3" />}
              {isFailed && <AlertCircle className="h-3 w-3" />}
              {isCancelled && <X className="h-3 w-3" />}
              Last: {WINDOW_LABELS[job.target_window as Window] || job.target_window} ·{" "}
              {job.messages_inserted.toLocaleString()} imported{" "}
              {job.finished_at && `· ${formatDistanceToNow(new Date(job.finished_at), { addSuffix: true })}`}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2 ml-auto">
                <DownloadCloud className="h-3 w-3 mr-1.5" />
                Backfill
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["90d", "1y", "3y", "all"] as Window[]).map((w) => (
                <DropdownMenuItem key={w} onClick={() => { setPendingWindow(w); setConfirmOpen(true); }}>
                  <History className="h-3 w-3 mr-2" />
                  {WINDOW_LABELS[w]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backfill {WINDOW_LABELS[pendingWindow]}</DialogTitle>
            <DialogDescription>
              Imports {pendingWindow === "all" ? "every email in" : "messages from"}{" "}
              <span className="font-medium text-foreground">{emailAddress}</span>{" "}
              ({provider}) into the CRM. This runs in the background — safe to close this tab.
              {pendingWindow === "all" && " For large mailboxes this can take 30+ minutes."}
              <br /><br />
              Existing emails are deduplicated automatically. Conversations with no matching lead land in the Unmatched inbox where you can promote them to leads.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={starting}>
              Cancel
            </Button>
            <Button onClick={startBackfill} disabled={starting}>
              {starting ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Starting…</> : <>Start backfill</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
