

# Why you see no progress (and how to fix the visibility + speed)

## What's actually happening

I queried the live database. Here's the truth:

**Queue state right now:**
- 161 leads `pending` in `fireflies_retry_queue` (synthetic id `backfill:<lead_id>`)
- 0 `done`, 0 `gave_up`

**Cron run history:**
- The drainer `process-fireflies-backfill-queue` HAS fired once already at **11:22 UTC** — processed 2 rows, 0 recovered, 2 still searching
- The cron is registered as `*/10 * * * *` and is **active**
- Next tick: every 10 minutes on the dot

**Why you don't see "first run" on Fireflies backfill enqueue:**
- The enqueue function ran successfully (that's how 161 rows got there), but the function itself **never logged to `cron_run_log`** — so the UI shows "Never reported" forever
- The drainer DID log (1 entry, 11:22), but the panel row uses interval `10` so anything >15min ago shows "Stale"

**The two real problems:**
1. **Drain rate is glacial** — 8 leads / 10 min = ~3.5 hours just to attempt all 161 once. With 3 retry attempts max and 5m/30m/2h backoff, full completion takes 6–8 hours
2. **Zero in-app visibility** — no way to see "47/161 done" without you opening the database

## What I'll change

### 1. Make the drainer 4× faster (40 leads / 5 min = full sweep in ~20 min)

Current: `MAX_PER_TICK = 8`, runs every 10 min  
New: `MAX_PER_TICK = 20`, runs every **5 min**

Each lead's Fireflies search takes ~3–4s. 20 leads × 4s = 80s, comfortably under the 100s wall-time budget. Total throughput: **240 leads/hour** — full backlog cleared in **40 minutes** instead of 3.5 hours.

Update the pg_cron schedule from `*/10` → `*/5`.

### 2. Make the enqueue function log to `cron_run_log`

Add a `logCronRun("enqueue-fireflies-backfill", "success", insertedCount, …)` at the end so the Automation Health row stops saying "Never reported" after you trigger it.

### 3. Add a live progress widget to Automation Health

A new compact card that polls every 10 seconds and shows:

```text
Fireflies backfill progress
████████░░░░░░░░░░░░  47 / 161  (29%)
✓ 12 matched   ⊘ 4 gave up   ⏳ 145 pending
Last drain: 2 min ago · Next drain: in 3 min
```

Pulls from a single SQL query (`status, COUNT(*) FROM fireflies_retry_queue WHERE fireflies_id LIKE 'backfill:%' GROUP BY status`) so it's accurate to the second.

### 4. Trigger an immediate drain after enqueue

Right now after you click "Run" on the enqueue function, you wait up to 10 min for the first drain tick. I'll have the enqueue function fire-and-forget invoke the drainer once at the end so progress starts immediately.

## Files I'll touch

- `supabase/functions/process-fireflies-backfill-queue/index.ts` — bump `MAX_PER_TICK` to 20
- `supabase/functions/enqueue-fireflies-backfill/index.ts` — add `logCronRun()` + immediate drainer kick
- `src/components/AutomationHealthPanel.tsx` — add `<FirefliesBackfillProgress />` card above the job table; update enqueue row interval to reflect manual nature; update drainer interval to 5
- One SQL migration: `cron.unschedule('process-fireflies-backfill-queue-every-10-min')` then re-schedule at `*/5 * * * *`

## After this build

- Click "Run" on **Fireflies backfill enqueue** → you immediately see "Last run: just now · 161 enqueued"
- A live progress bar appears showing matched / gave up / pending counts updating every 10s
- Backlog clears in ~40 minutes instead of 3.5 hours
- No more "is it actually doing anything?" mystery

