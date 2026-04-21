

# Verified: it IS working — but the panel is lying about "Stale"

## Ground truth (just verified against live DB)

| Signal | Reality |
|---|---|
| pg_cron ticks (last 50 min) | **10/10 succeeded** at exact 5-min intervals (14:05, 14:10, …, 14:50) |
| Queue rows actually updated in last 15 min | **7 rows touched** |
| Backlog progress | **16 gave_up · 145 pending** (was 0 / 161 an hour ago) |
| `cron_run_log` entries in last 30 min | **Only 1** (14:42) — that's why panel shows "Stale" |
| Manual curl just now | **Context-canceled** (function ran past gateway window) |

So the work is happening — the panel just isn't seeing it because the function sometimes runs long enough to be killed before its final `logCronRun()` call fires.

## Why "Stale · about 1 hour ago"

`AutomationHealthPanel` reads the most recent `cron_run_log` row per job. When the function is killed mid-flight (context canceled by the edge gateway after ~150s), the `try { … logCronRun … } catch` block never reaches the log write. So even though pg_cron successfully invoked it 10 times, only 1 of those 10 produced a log entry.

The work still gets done — Postgres updates committed before the kill stay committed — but the panel is blind to it.

## Fix — three small, surgical changes

### 1. Log first, work second

Move `logCronRun(JOB_NAME, "running", 0, { startedAt })` to the **top** of the function (right after queue counts), before the heavy fetch loop. Then on completion update with final stats. If the function gets killed mid-loop, you still see "running" + start time on the panel instead of nothing.

Implemented as: insert a "running" heartbeat row first, then UPDATE that row's status/details at the end. (Or simpler: just call `logCronRun` twice — once at start with status `running`, once at end with final status.)

### 2. Tighten the wall budget so we always exit cleanly

Current `WALL_BUDGET_MS = 120_000` (120s). Edge gateway kills at ~150s. The 30s gap should be enough — but the loop has a per-lead 25-30s fetch, so if we start lead 5 at the 95s mark we can blow past 150s.

Drop `WALL_BUDGET_MS` to **90s** and `MAX_PER_TICK` stays at 5. That guarantees we exit ≥60s before gateway kill, with time to write the final `logCronRun`.

### 3. Re-arm the panel: count `last_row_update` as the freshness signal, not just `cron_run_log`

In `AutomationHealthPanel.tsx`, for the Fireflies backfill row specifically: if the queue table itself shows recent activity (any `updated_at > now() - 15 min` on backfill rows), don't show "Stale" — show "Working" with the count of rows touched. This is the ground-truth signal and it can't lie.

## What you'll see after the fix

- Panel updates every 5 min showing real progress, never falsely stale
- Each tick runs ~3-5 leads in <90s, exits cleanly, logs successfully
- Backlog of 145 drains in ~2.5 hours (5 leads × 12 ticks/hour ÷ 60s overhead)
- "Working · X leads classified in last 15 min" replaces misleading "Stale"

## Files

- `supabase/functions/process-fireflies-backfill-queue/index.ts` — log heartbeat at start; tighten `WALL_BUDGET_MS` to 90000
- `src/components/AutomationHealthPanel.tsx` — query `fireflies_retry_queue` recent updates as fallback freshness signal for the Fireflies backfill row

