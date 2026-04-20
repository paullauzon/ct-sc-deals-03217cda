import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Play, RefreshCw, AlertTriangle, ExternalLink, Zap, Wifi } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CronJob {
  jobName: string;
  label: string;
  description: string;
  intervalMinutes: number; // for staleness detection
  endpoint: string; // edge function name
  body: Record<string, unknown>;
}

const JOBS: CronJob[] = [
  { jobName: "auto-enrich-ai-tier", label: "AI-tier enrichment", description: "Every 30m on weekdays · 10 leads/run", intervalMinutes: 30, endpoint: "bulk-enrich-sourceco", body: { limit: 10, onlyEmptyAum: true } },
  { jobName: "auto-backfill-linkedin", label: "LinkedIn URL backfill", description: "Daily 02:00 UTC · 25 leads/run", intervalMinutes: 1440, endpoint: "backfill-linkedin", body: { limit: 25 } },
  { jobName: "auto-backfill-company-url", label: "Company URL backfill", description: "Daily 02:30 UTC · 50 leads/run", intervalMinutes: 1440, endpoint: "auto-backfill-company-url", body: { limit: 50 } },
  { jobName: "auto-reschedule-overdue", label: "Reschedule overdue tasks", description: "Daily 06:00 UTC · pushes to today", intervalMinutes: 1440, endpoint: "auto-reschedule-overdue", body: {} },
  { jobName: "auto-process-stale-transcripts", label: "Stale transcript processor", description: "Daily 03:00 UTC · 5 leads/run", intervalMinutes: 1440, endpoint: "bulk-process-stale-meetings", body: { limit: 5 } },
  { jobName: "process-scheduled-emails", label: "Scheduled-send dispatcher", description: "Every 5m · sends queued emails", intervalMinutes: 5, endpoint: "process-scheduled-emails", body: {} },
  { jobName: "process-fireflies-retry-queue", label: "Fireflies retry queue", description: "Every 15m · re-fetches broken transcripts", intervalMinutes: 15, endpoint: "process-fireflies-retry-queue", body: {} },
];

interface RunRow {
  id: string;
  job_name: string;
  status: string;
  items_processed: number;
  ran_at: string;
  error_message: string | null;
  details: Record<string, unknown> | null;
}

// Daily automation jobs that need a manual kick when their UTC slot is hours away
// but the work backlog is huge (e.g. 556 overdue tasks, 150 unenriched leads).
const DAILY_JOBS = [
  "auto-enrich-ai-tier",
  "auto-backfill-linkedin",
  "auto-backfill-company-url",
  "auto-reschedule-overdue",
  "auto-process-stale-transcripts",
];

export function AutomationHealthPanel() {
  const [latestByJob, setLatestByJob] = useState<Record<string, RunRow | null>>({});
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [runningAllDaily, setRunningAllDaily] = useState(false);
  const [firecrawlBroken, setFirecrawlBroken] = useState(false);
  const [firecrawlTesting, setFirecrawlTesting] = useState(false);
  const [firecrawlStatus, setFirecrawlStatus] = useState<null | { ok: boolean; code: number; msg: string }>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cron_run_log")
      .select("id, job_name, status, items_processed, ran_at, error_message, details")
      .order("ran_at", { ascending: false })
      .limit(200);

    const map: Record<string, RunRow | null> = {};
    JOBS.forEach(j => { map[j.jobName] = null; });
    let firecrawl403 = false;
    (data ?? []).forEach((r: any) => {
      if (!map[r.job_name]) map[r.job_name] = r as RunRow;
      const detailsFlag = r?.details && typeof r.details === "object" && (r.details as any).firecrawl403 === true;
      const errorHasFirecrawl = String(r?.error_message || "").toLowerCase().includes("firecrawl");
      if (detailsFlag || errorHasFirecrawl) firecrawl403 = true;
    });
    setLatestByJob(map);
    setFirecrawlBroken(firecrawl403);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runNow = async (job: CronJob) => {
    setRunningJob(job.jobName);
    try {
      const { error } = await supabase.functions.invoke(job.endpoint, { body: job.body });
      if (error) throw error;
      toast.success(`${job.label} triggered`);
      setTimeout(load, 1500);
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setRunningJob(null);
    }
  };

  const runAllDaily = async () => {
    setRunningAllDaily(true);
    const dailyJobs = JOBS.filter(j => DAILY_JOBS.includes(j.jobName));
    toast.info(`Triggering ${dailyJobs.length} daily automations…`);
    const results = await Promise.allSettled(
      dailyJobs.map(j => supabase.functions.invoke(j.endpoint, { body: j.body }))
    );
    const ok = results.filter(r => r.status === "fulfilled" && !(r.value as any)?.error).length;
    const failed = results.length - ok;
    if (failed === 0) toast.success(`All ${ok} daily jobs triggered. Logs will appear shortly.`);
    else toast.warning(`${ok} succeeded, ${failed} failed. Check individual rows.`);
    setRunningAllDaily(false);
    setTimeout(load, 2500);
  };

  const testFirecrawl = async () => {
    setFirecrawlTesting(true);
    setFirecrawlStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-firecrawl", { body: {} });
      if (error) throw error;
      const code = (data as any)?.status ?? 0;
      const ok = code >= 200 && code < 300;
      setFirecrawlStatus({
        ok,
        code,
        msg: ok ? "Firecrawl is responding (200)" :
             code === 402 ? "Out of credits (402)" :
             code === 403 ? "Auth failed (403) — reconnect Firecrawl" :
             code ? `HTTP ${code}` : "No response",
      });
      if (!ok && code === 403) setFirecrawlBroken(true);
    } catch (e) {
      setFirecrawlStatus({ ok: false, code: 0, msg: `Test failed: ${(e as Error).message}` });
    } finally {
      setFirecrawlTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Automation health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Background jobs that fill data, send queued emails, and recover broken transcripts. A red dot means the job hasn't reported in 1.5× its interval.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={runAllDaily}
            disabled={runningAllDaily}
            className="h-7 px-2.5 text-xs gap-1.5"
            title="Trigger all 5 daily automation jobs in parallel"
          >
            {runningAllDaily ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Run all daily
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={testFirecrawl}
            disabled={firecrawlTesting}
            className="h-7 px-2.5 text-xs gap-1.5"
            title="Ping Firecrawl API to verify connectivity"
          >
            {firecrawlTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
            Test Firecrawl
          </Button>
          <Button variant="ghost" size="sm" onClick={load} className="h-7 px-2" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {firecrawlStatus && (
        <div className={cn(
          "border rounded-lg p-2.5 text-xs flex items-center gap-2",
          firecrawlStatus.ok ? "border-foreground/10 bg-secondary/20" : "border-foreground/30 bg-secondary/40"
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", firecrawlStatus.ok ? "bg-foreground/40" : "bg-foreground")} />
          <span className="font-medium">{firecrawlStatus.msg}</span>
        </div>
      )}

      {firecrawlBroken && (
        <div className="border border-foreground/20 bg-secondary/40 rounded-lg p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-foreground">Firecrawl scraping is failing (403)</div>
            <p className="text-muted-foreground mt-0.5">
              AI-tier enrichment cannot scrape company websites until the Firecrawl connector is re-authenticated. Every enrichment run will produce zero results until this is fixed.
            </p>
            <a
              href="https://lovable.dev/projects/242959cb-c9bf-4eb5-a0bd-aea2e79cc31a/connectors"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-foreground hover:underline font-medium"
            >
              Reconnect Firecrawl <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Job</th>
              <th className="text-left px-4 py-2.5 font-medium">Last run</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-right px-4 py-2.5 font-medium">Items</th>
              <th className="text-right px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </td></tr>
            ) : JOBS.map(job => {
              const last = latestByJob[job.jobName];
              const ageMin = last ? (Date.now() - new Date(last.ran_at).getTime()) / 60000 : Infinity;
              const stale = ageMin > job.intervalMinutes * 1.5;
              const neverRan = !last;
              const failed = last?.status === "error";

              return (
                <tr key={job.jobName} className="hover:bg-secondary/20 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{job.label}</div>
                    <div className="text-xs text-muted-foreground">{job.description}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {last ? formatDistanceToNow(new Date(last.ran_at), { addSuffix: true }) : "Never reported"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs",
                      (stale || neverRan || failed) ? "text-foreground" : "text-muted-foreground"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        failed ? "bg-foreground" :
                        (stale || neverRan) ? "bg-foreground/60" :
                        "bg-foreground/30"
                      )} />
                      {failed ? "Errored" : neverRan ? "Awaiting first run" : stale ? "Stale" : "Healthy"}
                    </span>
                    {last?.error_message && (
                      <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[220px]" title={last.error_message}>
                        {last.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">
                    {last?.items_processed ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => runNow(job)}
                      disabled={runningJob === job.jobName}
                      title="Run now"
                    >
                      {runningJob === job.jobName
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Play className="h-3 w-3" />}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Crons are scheduled via <code className="font-mono">pg_cron</code> and report into <code className="font-mono">cron_run_log</code> at the end of each run. Use "Run now" to trigger a job immediately rather than waiting for the next tick.
      </p>
    </div>
  );
}
