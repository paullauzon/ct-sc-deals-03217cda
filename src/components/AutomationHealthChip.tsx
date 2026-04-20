import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const DAILY_JOB_NAMES = [
  "auto-enrich-ai-tier",
  "auto-backfill-linkedin",
  "auto-backfill-company-url",
  "auto-reschedule-overdue",
  "auto-process-stale-transcripts",
  "process-scheduled-emails",
  "process-fireflies-retry-queue",
];

interface Props {
  onClick: () => void;
}

/**
 * Tiny admin-only health chip shown in the nav. Counts how many of the 7
 * recurring jobs have a recent "success" or "noop" row in cron_run_log.
 * Clickable — jumps into the Automation tab of Mailbox Settings.
 */
export function AutomationHealthChip({ onClick }: Props) {
  const { isAdmin } = useAuth();
  const [healthy, setHealthy] = useState<number>(0);
  const [total] = useState<number>(DAILY_JOB_NAMES.length);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      // Pull the most recent row per job via a single query + client-side group.
      const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("cron_run_log")
        .select("job_name, status, ran_at")
        .in("job_name", DAILY_JOB_NAMES)
        .gte("ran_at", since)
        .order("ran_at", { ascending: false });

      if (cancelled) return;
      const seen = new Set<string>();
      let ok = 0;
      (data ?? []).forEach(r => {
        if (seen.has(r.job_name)) return;
        seen.add(r.job_name);
        if (r.status === "success" || r.status === "noop") ok += 1;
      });
      setHealthy(ok);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const allHealthy = loaded && healthy === total;
  const label = loaded ? `${healthy}/${total}` : "…";

  return (
    <button
      type="button"
      onClick={onClick}
      title="Automation health — click to open dashboard"
      className={cn(
        "h-8 px-2.5 flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors",
        "border-border bg-secondary/50 hover:bg-secondary",
        allHealthy ? "text-foreground" : "text-foreground",
      )}
    >
      <Zap className={cn("h-3.5 w-3.5", allHealthy ? "text-foreground/60" : "text-foreground")} />
      <span className="tabular-nums">{label}</span>
    </button>
  );
}
