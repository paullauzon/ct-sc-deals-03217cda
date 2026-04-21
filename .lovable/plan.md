

# Root cause found: the wrong queue is poaching the backfill rows

## What's actually broken

Two functions are competing for the same rows. The **rogue retry queue** wins every 15 min because it runs first, claims 20 rows, treats `backfill:<lead_id>` as a real Fireflies meeting ID, gets back "Transcript empty," then pushes `next_attempt_at` forward by 30+ min. By the time the proper drainer ticks at `*/5`, **0 rows are due**.

Hard evidence from the live DB:
- 161 rows pending, 0 done, 0 gave_up
- 78 rows at `attempts=1`, 83 at `attempts=2` — all stamped `last_error: "Transcript empty or not returned"` (the retry queue's exact error string)
- Latest `next_attempt_at = 14:00:23 UTC` (in the future), set by the retry queue at 13:30
- pg_cron IS firing the proper drainer every 5 min — boots logged at 13:30, 13:35 — but it finds nothing due
- The proper drainer never logs to `cron_run_log` because its first DB query returns 0 rows and the function's "noop" path was already gated by the prior fix (it returns early)

So **everything is wired correctly except the retry queue is hijacking the work and using a fundamentally wrong code path** (GET-by-id instead of search-by-calendly-window).

## Fix (one shot, no more iteration)

### 1. Gate the retry queue OUT of backfill rows

Edit `supabase/functions/process-fireflies-retry-queue/index.ts`: add `.not('fireflies_id', 'like', 'backfill:%')` to the row claim query so it only touches *real* fireflies retry rows. The proper drainer (`process-fireflies-backfill-queue`) already gates IN to `LIKE 'backfill:%'`. Clean separation, no more competition.

### 2. Reset the 161 hijacked rows so the proper drainer can claim them now

SQL via `supabase--insert`:
```sql
UPDATE fireflies_retry_queue
SET attempts = 0,
    next_attempt_at = now() + (random() * interval '60 seconds'),
    last_error = 'reset after retry-queue gating fix',
    status = 'pending',
    updated_at = now()
WHERE fireflies_id LIKE 'backfill:%' AND status = 'pending';
```
Random 0–60s spread prevents 161 simultaneous Fireflies API calls.

### 3. Force-tick the proper drainer immediately (don't wait 5 min)

`supabase--curl_edge_functions` POST `/process-fireflies-backfill-queue` with `{}`. With `MAX_PER_TICK=20` it processes the first batch (~80s) and returns hard counts. Then natural pg_cron ticks every 5 min drain the rest.

### 4. Make the "noop" path log too, so the panel stops lying

Edit `supabase/functions/process-fireflies-backfill-queue/index.ts`: when `dueRows.length === 0` it currently logs noop — verify that path actually inserts to `cron_run_log` (the `logCronRun` call exists but the early-return ordering means `cron_run_log` only gets one row when truly nothing-to-do, vs. zero rows when it processes work). I'll move the `logCronRun` to a `finally`-style wrap so it ALWAYS logs whatever happened, with `processed`, `recovered`, `gaveUp`, `stillSearching` populated. That kills the "Last run: never" mystery on the panel.

### 5. Add a "claimed by retry queue" telemetry note

In `process-fireflies-retry-queue/index.ts`, when the gate filter excludes rows, log it: `details.skipped_backfill_rows = <count>` so we can see in `cron_run_log` that the gate is working as intended.

## Files I'll touch

- `supabase/functions/process-fireflies-retry-queue/index.ts` — add `.not('fireflies_id','like','backfill:%')` gate + telemetry
- `supabase/functions/process-fireflies-backfill-queue/index.ts` — guarantee `logCronRun` fires on every invocation (success, noop, error)
- One `supabase--insert` SQL to reset the 161 hijacked rows
- One `supabase--curl_edge_functions` to force-tick the drainer immediately

## What you'll see within 2 minutes of the fix

- Refresh the Automation Health panel: progress widget jumps from `0 / 161 (0%)` to `~10–15 done / ~5–10 gave_up / rest pending`
- Within 40 minutes (8 ticks × 20 rows): full 161 attempted, ~57% recovered, rest marked `gave_up` with reason `not_in_fireflies_api`
- The retry queue row stops showing red (no more bogus "0/20 transcripts recovered" errors — it'll go back to noop because the only rows left are real fireflies retries and there are none)
- Panel `cron_run_log` for `process-fireflies-backfill-queue` populates every 5 min so you have ground-truth heartbeats

## Why this is the final fix

This is a clean separation-of-concerns fix at the queue-claim level. The drainer code itself is correct (proven: it ran successfully at 11:22 — processed 2, no errors). The schedule is correct (pg_cron run details confirm every-5-min ticks). The only break was two functions fighting for the same rows. Gate them apart, reset the hijacked state, and the system flows.

