import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, XCircle, Play, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { FirefliesBackfillReport } from "./FirefliesBackfillReport";

interface Counts {
  pending: number;
  done: number;
  gave_up: number;
  total: number;
  due_now: number;
  scheduled_later: number;
  lastDrainAt: string | null;
}

/**
 * Live progress card for the Fireflies historical backfill.
 * Polls every 10s; shows matched / gave-up / pending counts split into
 * "due now" vs "scheduled later", and time since the last drainer tick.
 * Includes a manual "Drain now" button as a self-heal escape hatch in case
 * pg_cron silently stops firing.
 */
export function FirefliesBackfillProgress() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [draining, setDraining] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const load = async () => {
    const nowIso = new Date().toISOString();
    const [{ data: queueRows }, { data: lastRun }] = await Promise.all([
      supabase
        .from("fireflies_retry_queue")
        .select("status, next_attempt_at")
        .like("fireflies_id", "backfill:%"),
      supabase
        .from("cron_run_log")
        .select("ran_at")
        .eq("job_name", "process-fireflies-backfill-queue")
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const rows = queueRows ?? [];
    const pending = rows.filter(r => r.status === "pending").length;
    const done = rows.filter(r => r.status === "done").length;
    const gave_up = rows.filter(r => r.status === "gave_up").length;
    const due_now = rows.filter(r => r.status === "pending" && (r.next_attempt_at ?? "") <= nowIso).length;
    const scheduled_later = pending - due_now;
    setCounts({
      pending, done, gave_up,
      total: rows.length,
      due_now,
      scheduled_later,
      lastDrainAt: lastRun?.ran_at ?? null,
    });
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const handleDrainNow = async () => {
    setDraining(true);
    toast.info("Drainer triggered — processing up to 20 leads (60–90s)…");
    try {
      // Fire-and-forget: function processes serially and may exceed gateway timeout
      supabase.functions.invoke("process-fireflies-backfill-queue", { body: {} }).catch(() => {});
      // Poll for up to 90s to surface progress
      let ticks = 0;
      const poll = setInterval(async () => {
        ticks += 1;
        await load();
        if (ticks >= 9) {
          clearInterval(poll);
          setDraining(false);
          toast.success("Drain cycle complete. Counts refreshed.");
        }
      }, 10_000);
    } catch (e) {
      setDraining(false);
      toast.error("Failed to trigger drainer");
    }
  };

  if (!counts || counts.total === 0) return null;

  const completed = counts.done + counts.gave_up;
  const pct = Math.round((completed / counts.total) * 100);

  return (
    <div className="border border-border rounded-lg p-3.5 bg-secondary/20">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold">Fireflies backfill progress</div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1.5"
            onClick={() => setReportOpen(true)}
            title="View per-lead breakdown"
          >
            <ListChecks className="h-3 w-3" />
            View full report
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5"
            onClick={handleDrainNow}
            disabled={draining || counts.due_now === 0}
            title={counts.due_now === 0 ? "No rows due right now" : "Manually invoke the drainer"}
          >
            {draining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {draining ? "Draining…" : "Drain now"}
          </Button>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {completed} / {counts.total} ({pct}%)
          </div>
        </div>
      </div>
      <Progress value={pct} className="h-1.5 mb-2.5" />
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          <span className="tabular-nums text-foreground">{counts.done}</span> matched
        </span>
        <span className="inline-flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          <span className="tabular-nums text-foreground">{counts.gave_up}</span> gave up
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span className="tabular-nums text-foreground">{counts.due_now}</span> due now
        </span>
        {counts.scheduled_later > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 opacity-50" />
            <span className="tabular-nums text-foreground">{counts.scheduled_later}</span> scheduled later
          </span>
        )}
        {counts.lastDrainAt && (
          <span className="ml-auto">
            Last drain {formatDistanceToNow(new Date(counts.lastDrainAt), { addSuffix: true })}
          </span>
        )}
      </div>
      <FirefliesBackfillReport open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
}
