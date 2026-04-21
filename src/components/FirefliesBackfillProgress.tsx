import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

interface Counts {
  pending: number;
  done: number;
  gave_up: number;
  total: number;
  lastDrainAt: string | null;
}

/**
 * Live progress card for the Fireflies historical backfill.
 * Polls every 10s while there's still pending work; shows matched / gave-up
 * / pending counts and the time since the last drainer tick.
 */
export function FirefliesBackfillProgress() {
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = async () => {
    const [{ data: queueRows }, { data: lastRun }] = await Promise.all([
      supabase
        .from("fireflies_retry_queue")
        .select("status")
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
    setCounts({
      pending,
      done,
      gave_up,
      total: rows.length,
      lastDrainAt: lastRun?.ran_at ?? null,
    });
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!counts || counts.total === 0) return null;

  const completed = counts.done + counts.gave_up;
  const pct = Math.round((completed / counts.total) * 100);

  return (
    <div className="border border-border rounded-lg p-3.5 bg-secondary/20">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold">Fireflies backfill progress</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {completed} / {counts.total} ({pct}%)
        </div>
      </div>
      <Progress value={pct} className="h-1.5 mb-2.5" />
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
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
          <span className="tabular-nums text-foreground">{counts.pending}</span> pending
        </span>
        {counts.lastDrainAt && (
          <span className="ml-auto">
            Last drain {formatDistanceToNow(new Date(counts.lastDrainAt), { addSuffix: true })}
          </span>
        )}
      </div>
    </div>
  );
}
