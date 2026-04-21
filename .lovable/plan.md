

# Make automation health truly readable + verify everything actually works

## What I found by auditing live data (last 7 days)

| Job | Runs | Items | Status | Verdict |
|---|---|---|---|---|
| AI-tier enrichment | 25 | 0 | **100% errored** | BROKEN (Firecrawl 403 — known) |
| LinkedIn URL backfill | 2 | 3 | OK | Healthy, low backlog |
| Company URL backfill | 2 | 81 | OK | Healthy |
| Reschedule overdue tasks | 2 | 1000 | OK | Healthy (cleared 1k tasks) |
| Stale transcript processor | 2 | 0 | OK | No work to do |
| Scheduled-send dispatcher | 257 | 0 | OK | No queued emails right now |
| Fireflies retry queue | 86 | 108 | "success" but **0 recovered** | DEGRADED — keeps "stillFailing" without raising error |
| **Fireflies backfill queue** | **1 only** | 2 | success | **BROKEN** — should tick every 5 min, hasn't ticked since 11:22 |
| Fireflies backfill enqueue | 1 | 0 (noop, all 161 already queued) | OK | Manual, working |

So three real problems:
1. **AI-tier enrichment silently broken** — the panel shows it as "Errored" but the *why* (Firecrawl 403) is buried
2. **Fireflies backfill drainer not actually running on the new 5-min schedule** — the migration likely targeted the wrong cron entry name
3. **Fireflies retry queue masks failures** — it returns `status='success'` even when 20/20 transcripts fail to recover, so the panel says "Healthy"

And the request itself: **every row needs a plain-English explanation of what the job does, what it touches, and what success looks like** — not just "Daily 02:00 UTC · 25 leads/run".

## What I'll build

### 1. Hyper-clear per-job explanations (expandable rows)

Each row in the Automation Health table gets an optional expand toggle. When opened it shows:

```text
┌─ AI-tier enrichment ──────────────────────────────────────────┐
│ What it does                                                  │
│   Scrapes company websites for SourceCo leads missing AUM     │
│   data, runs them through GPT to extract firm size / fund     │
│   stage / strategy, and writes results back to the lead.      │
│                                                               │
│ Triggered by                                                  │
│   pg_cron · every 30 min on weekdays (US business hours)      │
│                                                               │
│ Touches                                                       │
│   leads.firm_aum, leads.enrichment, leads.tier                │
│                                                               │
│ Success looks like                                            │
│   "items_processed: 10" with no error_message. Leads now      │
│   show AUM and tier scores in the pipeline.                   │
│                                                               │
│ Last 7 days: 25 runs, 0 items processed, 25 errored           │
│ Last error: Firecrawl returned 403 (auth)                     │
└───────────────────────────────────────────────────────────────┘
```

I'll author these for all 9 jobs. Each gets four fields: **What it does**, **Triggered by**, **Touches** (which DB tables), **Success looks like**, plus inline 7-day stats.

### 2. Fix the Fireflies backfill drainer schedule (it never went 5-min)

Verify and re-issue the pg_cron schedule:

```sql
-- Belt-and-suspenders: drop any existing entries with this name
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
  'process-fireflies-backfill-queue-every-10-min',
  'process-fireflies-backfill-queue-every-5-min',
  'process-fireflies-backfill-queue'
);

-- Schedule fresh at 5-min cadence
SELECT cron.schedule(
  'process-fireflies-backfill-queue-every-5-min',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/process-fireflies-backfill-queue',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

Will use `supabase--insert` (sensitive — anon key inline) per the rules.

### 3. Stop the Fireflies retry queue from masking 100% failures

Update `process-fireflies-retry-queue/index.ts`: when `recovered=0` AND `stillFailing > 0` AND no rows actually moved status, log `status='error'` (or `status='degraded'`) instead of `success`. Then the panel's red dot fires correctly.

### 4. Promote the Firecrawl 403 banner into a permanent row state

The panel already has a `firecrawlBroken` banner at the top, but the AI-tier enrichment row itself just says "Errored". I'll add an inline link "Reconnect Firecrawl →" directly under that row's status when its last error contains "firecrawl" or "403", so the cause and the fix are co-located.

### 5. Add per-job 7-day mini-stats next to each row

Compact text under the description: `Last 7d: 25 runs · 0 items · 100% errored` so you can see at a glance whether a job is actually doing useful work or just failing quietly.

### 6. Manual verification panel: "Verify all jobs"

A new button next to "Test Firecrawl" that, in parallel, GET-pings the cron schedule (via a tiny new edge function `verify-cron-health` that queries `cron.job` server-side since RLS blocks client access) and reports back:
- which jobs are scheduled vs missing
- the actual cron expression each one carries
- when each is next due to fire

Result rendered as a small table below so you can confirm everything the UI claims is actually wired up in pg_cron.

## Files I'll touch / create

- `src/components/AutomationHealthPanel.tsx` — expandable row UI + per-row stats + Firecrawl inline link + "Verify schedules" button + 7-day stats fetch
- `supabase/functions/process-fireflies-retry-queue/index.ts` — return `error` when 0 recovered and >0 stillFailing
- `supabase/functions/verify-cron-health/index.ts` — NEW, tiny function that runs `SELECT jobname, schedule, active FROM cron.job` server-side and returns the rows
- `supabase/config.toml` — register `verify-cron-health`
- One pg_cron migration via `supabase--insert`: re-establish 5-min schedule for backfill drainer

## What you'll see after this build

- Click any automation row → expands with a 4-field plain-English explanation, the tables it writes to, and 7-day stats
- AI-tier enrichment row shows "Reconnect Firecrawl →" inline (not just "Errored")
- Fireflies backfill drainer ticks every 5 min — backlog of 161 starts dropping immediately
- Fireflies retry queue turns red when it's silently failing (instead of green-but-useless)
- "Verify schedules" button proves to you that pg_cron actually has every job registered with the cadence the UI claims
- Live progress bar for the backfill keeps polling every 10s (already shipped) — now with accurate forecast based on real drain rate

