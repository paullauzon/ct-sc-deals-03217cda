

# Investigation result: enqueue ran, drainer registered but NOT firing — 0 enriched

## Hard facts from the live database

| Check | Result |
|---|---|
| Leads with calendly booking | **190** |
| Already had transcript | **29** |
| Need enrichment | **161** |
| Currently `pending` in queue | **161** |
| `done` (matched) | **0** |
| `gave_up` | **0** |
| Rows `due_now` (next_attempt_at ≤ now) | **105** |
| Drainer cron entry | `process-fireflies-backfill-queue-every-5-min` · `*/5 * * * *` · **active=true** |
| **Drainer runs logged since 11:22 UTC** | **ZERO** (1h 17m of silence despite being "every 5 min") |
| Last drainer run | 11:22:09 — processed 2, recovered 0 |
| Enqueue last run | 11:38:06 — noop (all 161 already queued) |

**Bottom line: 0 of 161 leads enriched. The drainer is "registered" but pg_cron is not actually invoking it.**

## Why this is happening (root cause)

The pg_cron schedule was created via `cron.schedule(name, '*/5 * * * *', $$ SELECT net.http_post(...) $$)`. The schedule shows `active=true` in `cron.job`, but no rows are landing in `cron.job_run_details` and `cron_run_log` is empty for that job after 11:22.

Three plausible causes, in order of likelihood:

1. **The `net.http_post` call inside the cron command is malformed** — most commonly the anon key was substituted as the literal string `<anon>` (or wrapped wrong), so `net.http_post` returns a request_id but the request itself errors / 401s before the function sees it. `net.http_post` is fire-and-forget and swallows errors silently.
2. **The cron command body has a SQL syntax error** — pg_cron will register it but skip execution each tick.
3. **The schedule name change orphaned the previous worker registration** — pg_cron occasionally needs the database to recycle the background worker after a fresh `cron.schedule()`.

The drainer function code itself is fine (it ran successfully at 11:22). The break is in **how pg_cron is calling it**.

## Verification I'll run as part of the fix

Query `cron.job_run_details` for the job to see the actual error pg_cron is logging, then re-author the schedule with a **known-good HTTP invocation pattern** (the same one used by the working `sync-fireflies-post-meeting` job that fires reliably every 15 min).

## What I'll do

### 1. Diagnose & re-issue the cron with the proven pattern

```sql
-- Inspect why ticks are silently failing
SELECT runid, status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='process-fireflies-backfill-queue-every-5-min')
ORDER BY start_time DESC LIMIT 10;

-- Drop and recreate using the exact pattern from the working sync-fireflies-post-meeting job
SELECT cron.unschedule('process-fireflies-backfill-queue-every-5-min');
SELECT cron.schedule(
  'process-fireflies-backfill-queue-every-5-min',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url:='https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/process-fireflies-backfill-queue',
       headers:=jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <FRESH_ANON_KEY_FROM_ENV>'
       ),
       body:='{}'::jsonb
     ); $$
);
```

Done via `supabase--insert` (SQL with secret inline, not a migration).

### 2. Kick the queue immediately so we don't wait 5 min for proof of life

After the schedule is fixed, manually invoke `process-fireflies-backfill-queue` once via `supabase--curl_edge_functions`. With 105 rows due now and `MAX_PER_TICK=20`, this will process the first 20 leads in ~80s and you'll see `done`/`gave_up` counts move immediately in the progress widget.

### 3. Add a self-heal "Drain now" button to the Automation Health panel

Right now the only way to manually trigger the drainer is from the function logs page. I'll add a **"Drain queue now"** button next to the Fireflies backfill progress widget that POSTs to the drainer directly, so if pg_cron ever silently dies again you can drain on demand without waiting.

### 4. Add `cron.job_run_details` heartbeat to the verify-cron-health endpoint

Update `verify-cron-health` to also return the **last 3 actual pg_cron execution attempts per job** (not just registration). That way "registered" doesn't lie to you again — you'll see "registered but 0 of last 12 ticks executed" if the schedule is broken.

## Files I'll touch

- `src/components/AutomationHealthPanel.tsx` — add "Drain queue now" button next to the Fireflies backfill progress widget
- `src/components/FirefliesBackfillProgress.tsx` — show "X due now / Y scheduled later" so you can see the queue's true readiness
- `supabase/functions/verify-cron-health/index.ts` — include `cron.job_run_details` so registered-but-not-firing is visible
- One SQL via `supabase--insert`: diagnose + re-schedule the drainer with a proven invocation pattern
- One curl via `supabase--curl_edge_functions`: kick the drainer once immediately

## Expected outcome after build

- Within 60 seconds of the fix: `done` count jumps from 0 → ~10–15 (the recent-90d leads, which Fireflies still has)
- Within 30 minutes: full 161 attempted, ~57% recovered (per original forecast), rest marked `gave_up`
- Verify schedules button now shows actual pg_cron tick history, not just registration status
- Manual "Drain now" button gives you ground-truth control if cron ever silently dies again

