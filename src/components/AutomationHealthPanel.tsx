import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Loader2, Play, RefreshCw, AlertTriangle, ExternalLink, Zap, Wifi,
  ChevronDown, ChevronRight, ShieldCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FirefliesBackfillProgress } from "./FirefliesBackfillProgress";

interface CronJob {
  jobName: string;
  label: string;
  description: string;
  intervalMinutes: number;
  endpoint: string;
  body: Record<string, unknown>;
  // Hyper-clear plain-English explanation surfaced when the row is expanded.
  explain: {
    what: string;
    triggeredBy: string;
    touches: string;
    successLooksLike: string;
  };
}

const JOBS: CronJob[] = [
  {
    jobName: "auto-enrich-ai-tier",
    label: "AI-tier enrichment",
    description: "Every 30m on weekdays · 10 leads/run",
    intervalMinutes: 30,
    endpoint: "bulk-enrich-sourceco",
    body: { limit: 10, onlyEmptyAum: true },
    explain: {
      what: "Scrapes company websites for SourceCo leads missing AUM data, runs them through GPT to extract firm size, fund stage and strategy, then writes the structured result back to the lead.",
      triggeredBy: "pg_cron · every 30 minutes during US business hours (Mon–Fri)",
      touches: "leads.firm_aum, leads.enrichment, leads.tier",
      successLooksLike: "items_processed > 0 and no error_message. Affected leads start showing AUM and tier scores in the pipeline.",
    },
  },
  {
    jobName: "auto-backfill-linkedin",
    label: "LinkedIn URL backfill",
    description: "Daily 02:00 UTC · 25 leads/run",
    intervalMinutes: 1440,
    endpoint: "backfill-linkedin",
    body: { limit: 25 },
    explain: {
      what: "Finds leads missing a LinkedIn profile URL and runs the AI Search Agent (Serper + GPT) to locate the right person, verify the match, and store the canonical LinkedIn URL.",
      triggeredBy: "pg_cron · once daily at 02:00 UTC",
      touches: "leads.linkedin_url, leads.linkedin_title, leads.linkedin_score, leads.linkedin_search_log",
      successLooksLike: "items_processed equals the number of leads that had a missing LinkedIn URL and got one assigned with a confidence match.",
    },
  },
  {
    jobName: "auto-backfill-company-url",
    label: "Company URL backfill",
    description: "Daily 02:30 UTC · 50 leads/run",
    intervalMinutes: 1440,
    endpoint: "auto-backfill-company-url",
    body: { limit: 50 },
    explain: {
      what: "Locates the official company website for leads that have a company name but no URL. Used to enable downstream scraping, logo lookup, and AI enrichment.",
      triggeredBy: "pg_cron · once daily at 02:30 UTC",
      touches: "leads.company_url, leads.website_url",
      successLooksLike: "items_processed > 0 with no errors. Pipeline cards begin showing favicons for those companies.",
    },
  },
  {
    jobName: "auto-reschedule-overdue",
    label: "Reschedule overdue tasks",
    description: "Daily 06:00 UTC · pushes pending tasks forward",
    intervalMinutes: 1440,
    endpoint: "auto-reschedule-overdue",
    body: {},
    explain: {
      what: "Sweeps every pending lead_tasks record whose due_date is in the past and pushes it to today, so the Action Center never shows ancient stale work.",
      triggeredBy: "pg_cron · once daily at 06:00 UTC",
      touches: "lead_tasks.due_date",
      successLooksLike: "items_processed equals the count of tasks that were rescheduled. Action Center backlog drops to zero overdue.",
    },
  },
  {
    jobName: "auto-process-stale-transcripts",
    label: "Stale transcript processor",
    description: "Daily 03:00 UTC · 5 leads/run",
    intervalMinutes: 1440,
    endpoint: "bulk-process-stale-meetings",
    body: { limit: 5 },
    explain: {
      what: "Finds meetings already in the database that were never extracted (no summary, no action items) and runs the GPT-4o intelligence pipeline on them so the deal narrative stays current.",
      triggeredBy: "pg_cron · once daily at 03:00 UTC",
      touches: "leads.meetings, leads.deal_intelligence, leads.fireflies_summary, leads.fireflies_next_steps",
      successLooksLike: "items_processed > 0 when there's stale work; 0 with status=success when everything is already extracted.",
    },
  },
  {
    jobName: "process-scheduled-emails",
    label: "Scheduled-send dispatcher",
    description: "Every 5m · sends queued emails",
    intervalMinutes: 5,
    endpoint: "process-scheduled-emails",
    body: {},
    explain: {
      what: "Polls lead_emails for any row where send_status='scheduled' and scheduled_for <= now(), then dispatches via Gmail or Outlook depending on the connection.",
      triggeredBy: "pg_cron · every 5 minutes, around the clock",
      touches: "lead_emails.send_status, lead_emails.message_id, lead_email_metrics.total_sent",
      successLooksLike: "items_processed > 0 when emails are due; 0 with status=success when the queue is empty (the typical state).",
    },
  },
  {
    jobName: "process-fireflies-retry-queue",
    label: "Fireflies retry queue",
    description: "Every 15m · re-fetches broken transcripts",
    intervalMinutes: 15,
    endpoint: "process-fireflies-retry-queue",
    body: {},
    explain: {
      what: "Auto-detects leads whose Fireflies URL is set but transcript is missing/short, enqueues them, then re-fetches via the Fireflies API with exponential backoff (5m → 30m → 2h → 6h → 24h). Marks gave_up after 5 attempts.",
      triggeredBy: "pg_cron · every 15 minutes",
      touches: "fireflies_retry_queue, leads.fireflies_transcript, leads.fireflies_summary, leads.meetings",
      successLooksLike: "items_processed > 0 with recovered > 0. Status flips to 'error' if 0/N transcripts recovered (Fireflies likely doesn't have them).",
    },
  },
  {
    jobName: "process-fireflies-backfill-queue",
    label: "Fireflies backfill queue",
    description: "Every 5m · 20 leads/run · searches historical Calendly meetings",
    intervalMinutes: 5,
    endpoint: "process-fireflies-backfill-queue",
    body: {},
    explain: {
      what: "For leads that booked via Calendly but never got a Fireflies transcript matched, searches the Fireflies vault using the lead's name + email + Calendly date and attaches the matching transcript when found.",
      triggeredBy: "pg_cron · every 5 minutes (one-time backfill of 161 historical leads)",
      touches: "fireflies_retry_queue (rows prefixed 'backfill:'), leads.fireflies_url, leads.fireflies_transcript, leads.meetings",
      successLooksLike: "items_processed up to 20 per tick. Recovered count climbs steadily; pending count drops toward zero as the backlog drains.",
    },
  },
  {
    jobName: "enqueue-fireflies-backfill",
    label: "Fireflies backfill enqueue",
    description: "Manual · scans Calendly leads missing transcripts",
    intervalMinutes: 1440 * 30,
    endpoint: "enqueue-fireflies-backfill",
    body: {},
    explain: {
      what: "One-shot scanner: walks every lead with calendly_booked_at and a missing/short transcript, then inserts a row into fireflies_retry_queue prefixed 'backfill:<lead_id>'. Triggers an immediate drainer kick afterward.",
      triggeredBy: "Manual button only — not on a cron schedule",
      touches: "fireflies_retry_queue (insert)",
      successLooksLike: "items_processed reflects how many new rows were enqueued. 0 with status=noop means everything is already queued or transcripts already exist.",
    },
  },
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

interface JobStats {
  runs7d: number;
  items7d: number;
  errors7d: number;
}

const DAILY_JOBS = [
  "auto-enrich-ai-tier",
  "auto-backfill-linkedin",
  "auto-backfill-company-url",
  "auto-reschedule-overdue",
  "auto-process-stale-transcripts",
];

export function AutomationHealthPanel() {
  const [latestByJob, setLatestByJob] = useState<Record<string, RunRow | null>>({});
  const [stats7dByJob, setStats7dByJob] = useState<Record<string, JobStats>>({});
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [runningAllDaily, setRunningAllDaily] = useState(false);
  const [firecrawlBroken, setFirecrawlBroken] = useState(false);
  const [firecrawlTesting, setFirecrawlTesting] = useState(false);
  const [firecrawlStatus, setFirecrawlStatus] = useState<null | { ok: boolean; code: number; msg: string }>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | { source: string; note?: string; jobs: any[] }>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("cron_run_log")
      .select("id, job_name, status, items_processed, ran_at, error_message, details")
      .gte("ran_at", since)
      .order("ran_at", { ascending: false })
      .limit(2000);

    const map: Record<string, RunRow | null> = {};
    const stats: Record<string, JobStats> = {};
    JOBS.forEach(j => {
      map[j.jobName] = null;
      stats[j.jobName] = { runs7d: 0, items7d: 0, errors7d: 0 };
    });
    let firecrawl403 = false;
    (data ?? []).forEach((r: any) => {
      if (!map[r.job_name]) map[r.job_name] = r as RunRow;
      if (stats[r.job_name]) {
        stats[r.job_name].runs7d += 1;
        stats[r.job_name].items7d += r.items_processed || 0;
        if (r.status === "error") stats[r.job_name].errors7d += 1;
      }
      const detailsFlag = r?.details && typeof r.details === "object" && (r.details as any).firecrawl403 === true;
      const errorHasFirecrawl = String(r?.error_message || "").toLowerCase().includes("firecrawl");
      if (detailsFlag || errorHasFirecrawl) firecrawl403 = true;
    });
    setLatestByJob(map);
    setStats7dByJob(stats);
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

  const verifySchedules = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("verify-cron-health", { body: {} });
      if (error) throw error;
      setVerifyResult(data as any);
    } catch (e) {
      toast.error(`Verify failed: ${(e as Error).message}`);
    } finally {
      setVerifying(false);
    }
  };

  const toggleExpanded = (jobName: string) => {
    const next = new Set(expanded);
    if (next.has(jobName)) next.delete(jobName); else next.add(jobName);
    setExpanded(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Automation health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Background jobs that fill data, send queued emails, and recover broken transcripts. Click any row to see exactly what it does, what it touches, and how it's performing this week.
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
            onClick={verifySchedules}
            disabled={verifying}
            className="h-7 px-2.5 text-xs gap-1.5"
            title="Confirm pg_cron has every job registered"
          >
            {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Verify schedules
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

      {verifyResult && (
        <div className="border border-border rounded-lg p-3 bg-secondary/20">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold">Schedule verification</div>
            <div className="text-[10px] text-muted-foreground">Source: {verifyResult.source}</div>
          </div>
          {verifyResult.note && (
            <p className="text-[11px] text-muted-foreground mb-2">{verifyResult.note}</p>
          )}
          <div className="space-y-1">
            {JOBS.map(job => {
              const found = verifyResult.jobs.find((j: any) =>
                j.jobname === job.jobName ||
                j.jobname?.startsWith(job.jobName) ||
                j.jobname?.includes(job.jobName)
              );
              const registered = !!found;
              return (
                <div key={job.jobName} className="flex items-center gap-2 text-[11px]">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                    registered ? "bg-foreground/60" : "bg-foreground")} />
                  <span className="font-medium min-w-[200px]">{job.label}</span>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {registered ? (found.schedule || "registered") : "NOT FOUND in pg_cron"}
                  </span>
                  {registered && found.runs_24h !== undefined && (
                    <span className="ml-auto text-muted-foreground">{found.runs_24h} runs / 24h</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FirefliesBackfillProgress />

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium w-[6px]"></th>
              <th className="text-left px-2 py-2.5 font-medium">Job</th>
              <th className="text-left px-4 py-2.5 font-medium">Last run</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-right px-4 py-2.5 font-medium">Items</th>
              <th className="text-right px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              </td></tr>
            ) : JOBS.map(job => {
              const last = latestByJob[job.jobName];
              const stats = stats7dByJob[job.jobName] || { runs7d: 0, items7d: 0, errors7d: 0 };
              const ageMin = last ? (Date.now() - new Date(last.ran_at).getTime()) / 60000 : Infinity;
              const stale = ageMin > job.intervalMinutes * 1.5;
              const neverRan = !last;
              const failed = last?.status === "error";
              const isOpen = expanded.has(job.jobName);
              const errLower = String(last?.error_message || "").toLowerCase();
              const isFirecrawlError = failed && (errLower.includes("firecrawl") || errLower.includes("403"));
              const errorRate = stats.runs7d > 0 ? Math.round((stats.errors7d / stats.runs7d) * 100) : 0;

              return (
                <>
                  <tr
                    key={job.jobName}
                    className="hover:bg-secondary/20 align-top cursor-pointer"
                    onClick={() => toggleExpanded(job.jobName)}
                  >
                    <td className="pl-3 pr-0 py-3">
                      {isOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium">{job.label}</div>
                      <div className="text-xs text-muted-foreground">{job.description}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        Last 7d: {stats.runs7d} runs · {stats.items7d} items
                        {stats.errors7d > 0 && ` · ${errorRate}% errored`}
                      </div>
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
                      {isFirecrawlError && (
                        <a
                          href="https://lovable.dev/projects/242959cb-c9bf-4eb5-a0bd-aea2e79cc31a/connectors"
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 mt-1 text-[10px] text-foreground hover:underline font-medium"
                        >
                          Reconnect Firecrawl <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums">
                      {last?.items_processed ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                  {isOpen && (
                    <tr key={`${job.jobName}-explain`} className="bg-secondary/10">
                      <td></td>
                      <td colSpan={5} className="px-2 py-3">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs max-w-3xl">
                          <ExplainField label="What it does" value={job.explain.what} />
                          <ExplainField label="Triggered by" value={job.explain.triggeredBy} />
                          <ExplainField label="Touches (DB)" value={job.explain.touches} mono />
                          <ExplainField label="Success looks like" value={job.explain.successLooksLike} />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Crons are scheduled via <code className="font-mono">pg_cron</code> and report into <code className="font-mono">cron_run_log</code> at the end of each run. Click "Verify schedules" to confirm every job is actually registered with pg_cron and ticking on its expected cadence.
      </p>
    </div>
  );
}

function ExplainField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={cn("text-foreground/90 leading-snug", mono && "font-mono text-[11px]")}>{value}</div>
    </div>
  );
}
