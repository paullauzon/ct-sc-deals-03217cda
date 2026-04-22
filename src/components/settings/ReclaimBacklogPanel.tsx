// Round 9 — Job-based reclaim panel. Enqueues a reclaim_jobs row and polls
// progress every 5s. Survives page reloads — the pg_cron tick runs every 2
// minutes regardless of whether the user is watching.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2, Inbox, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ReclaimJob {
  id: string;
  status: string;
  total_scanned: number;
  total_reclassified: number;
  total_remaining: number;
  thread_claimed: number;
  forward_claimed: number;
  cc_claimed: number;
  internal_claimed: number;
  outbound_claimed: number;
  noise_routed: number;
  firm_unrelated_routed: number;
  last_tick_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  cursor: string | null;
}

export function ReclaimBacklogPanel({ onComplete }: { onComplete?: () => void }) {
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);
  const [job, setJob] = useState<ReclaimJob | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [countRes, jobRes] = await Promise.all([
      supabase.from("lead_emails").select("id", { count: "exact", head: true }).eq("lead_id", "unmatched"),
      supabase
        .from("reclaim_jobs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setUnmatchedCount(countRes.count ?? 0);
    setJob((jobRes.data as ReclaimJob | null) ?? null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 5s while a job is running
  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(() => {
      refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [job?.status, refresh]);

  // Notify on completion transition
  useEffect(() => {
    if (job?.status === "completed" && onComplete) onComplete();
  }, [job?.status, onComplete]);

  const start = async () => {
    if (!unmatchedCount) return;
    if (!window.confirm(`Re-process ${unmatchedCount.toLocaleString()} unmatched emails through the full classification pipeline? This runs in the background — you can close this tab.`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("reclaim-unmatched-backlog", { body: {} });
      if (error) throw error;
      if ((data as any)?.already_running) {
        toast.info("Reclaim already in progress");
      } else {
        toast.success("Reclaim started — processing in background");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to start reclaim");
    } finally {
      setBusy(false);
    }
  };

  if (unmatchedCount === null) return null;
  if (unmatchedCount === 0 && !job) return null;

  const isRunning = job?.status === "running";
  const isCompleted = job?.status === "completed";
  const totalProcessed = job?.total_scanned ?? 0;
  const denominator = (job?.total_remaining || 0) + totalProcessed;
  const pct = denominator > 0 ? Math.min(100, Math.round((totalProcessed / denominator) * 100)) : 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/20 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Reclaim historical unmatched backlog</span>
        {isRunning && (
          <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> running
          </span>
        )}
        {isCompleted && (
          <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> done
          </span>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm">
              <span className="font-medium tabular-nums">{unmatchedCount.toLocaleString()}</span>
              <span className="text-muted-foreground"> email{unmatchedCount === 1 ? "" : "s"} still in unmatched</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Re-runs noise classifier, thread continuity, CC overlap, forwarded-sender extraction, internal-team routing, outbound recipient match, and firm-unrelated detection.
            </div>
          </div>
          {!isRunning && (
            <Button size="sm" onClick={start} disabled={busy || unmatchedCount === 0}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
              {isCompleted ? "Run again" : "Start reclaim"}
            </Button>
          )}
        </div>

        {job && (
          <>
            {isRunning && (
              <div className="space-y-1">
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-foreground/60 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {totalProcessed.toLocaleString()} processed{denominator > 0 ? ` of ~${denominator.toLocaleString()} (${pct}%)` : ""}
                  {job.last_tick_at && ` · last tick ${new Date(job.last_tick_at).toLocaleTimeString()}`}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <Stat label="Reclassified" value={job.total_reclassified} />
              <Stat label="Thread" value={job.thread_claimed} />
              <Stat label="To/CC" value={job.cc_claimed} />
              <Stat label="Forwarded" value={job.forward_claimed} />
              <Stat label="Internal" value={job.internal_claimed} />
              <Stat label="Outbound" value={job.outbound_claimed} />
              <Stat label="Noise" value={job.noise_routed} />
              <Stat label="Firm-unrelated" value={job.firm_unrelated_routed} />
            </div>

            {job.last_error && (
              <div className="text-[11px] text-destructive">{job.last_error}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-secondary/30 rounded px-2 py-1.5">
      <div className="font-medium tabular-nums">{(value || 0).toLocaleString()}</div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
    </div>
  );
}
