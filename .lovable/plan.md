

# Why the button looks like it does nothing — and what's actually true under the hood

## The truth (verified against the live DB right now)

The button **IS working perfectly**. Two things are conspiring to make it look broken:

### 1. You're clicking the wrong button for what you want

The screenshot shows you clicked **"Fireflies backfill enqueue"** (the small ▷ play icon on the right of that row). That function's job is *only* to scan leads and add them to the queue — and **all 161 are already queued**. So it correctly returns `noop · 0 items` in 200ms. From the UI it looks like "nothing happened" because nothing needed to happen.

What you actually want to click to *make leads get enriched* is **"Drain now"** on the Fireflies backfill progress widget. That button calls the *drainer* (`process-fireflies-backfill-queue`), which is the thing that actually fetches transcripts.

### 2. The drainer IS running and it IS working — but it's almost done finding nothing

Hard data from the queue right now (14:00 UTC):
- 161 pending · **0 done · 0 gave_up**
- Last drainer run 13:42 UTC: processed 3, **recovered 0**, scheduled rest for retry
- Earlier run 11:22 UTC: processed 2, recovered 0
- The drainer has tried 31 leads so far — **0 transcripts found**
- Average attempts on pending rows: 0.22 (most haven't even been touched yet because they keep getting backed-off into the future after each failed attempt)

**Why 0 are recovered:** Fireflies' API only retains transcripts for ~90 days on most plans. Of your 161 calendly bookings missing transcripts, the vast majority are from older meetings where Fireflies no longer holds the recording. They WILL all eventually flip to `gave_up` after 3 attempts each — but at the current 5-min cron tick + 5min/30min/2h backoff, that takes hours of wall time even though each tick is fast.

### 3. The `invoke()` call has no return-value display, so the UI looks dead

`runNow()` calls `supabase.functions.invoke(job.endpoint)` and only shows a generic "triggered" toast. It doesn't surface what the function returned (e.g., `{ scanned: 161, enqueued: 0, skipped_existing: 161 }`). So even when enqueue runs successfully and returns useful info, you see nothing in the UI besides the toast disappearing fast.

## What I'll build to fix the perception AND accelerate the actual work

### Fix 1: Surface the function's actual return payload in the UI (kills the "nothing happened" feeling)

Update `runNow()` in `src/components/AutomationHealthPanel.tsx` to:
- Capture `data` from `invoke()`
- Show a **detailed success toast**: `"enqueue-fireflies-backfill: scanned 161 · enqueued 0 · already queued 161 — backlog already in flight, click Drain now"`
- For the backfill drainer: `"Drainer: processed 3 · recovered 0 · still searching 0 · gave up 3"`
- Auto-refresh the row's "Last run" stats within 2s so you see the row update in front of you

### Fix 2: Inline-link "Drain now" directly from the row that needs it

Add a contextual hint under the **Fireflies backfill enqueue** row when the queue is non-empty:
> *"Queue has 161 pending. Enqueue is a no-op. Use **Drain now** below to actually process them →"*

Plus add a second action button on that row labeled **"Drain queue"** that calls the drainer directly (not the enqueue function), so you don't have to scroll down to find it.

### Fix 3: Compress the backoff so the 161 backlog drains in minutes instead of hours

The current backoff schedule (`5m → 30m → 2h`) was designed for transient API errors, not "Fireflies doesn't have this meeting." When the failure mode is "transcript not in Fireflies" (which it is, 100% of the time so far), there's no point waiting 2 hours to try again — it's not coming back.

I'll change `process-fireflies-backfill-queue/index.ts`:
- When the failure is `not_in_fireflies_api` (vs a transient HTTP error), skip backoff entirely and **mark `gave_up` immediately on the first miss**
- Keep the `5m → 30m → 2h` schedule only for actual fetch errors (HTTP 5xx, timeouts, rate limits)

This means every tick attempts 20 fresh leads → all 161 will be classified within ~40 minutes (8 ticks × 5min) instead of 4+ hours.

### Fix 4: Auto-trigger the drainer immediately after enqueue does anything useful

If the user clicks "Run" on enqueue and it inserts ≥1 new row, fire-and-forget invoke `process-fireflies-backfill-queue` immediately so they see progress within 60s instead of waiting for the next cron tick. (The enqueue function already does this in code, but only in one branch — I'll verify it always fires.)

### Fix 5: Force-tick the drainer once via curl as part of this build

So when the build completes you immediately see counts move from `0 done / 0 gave_up` to something like `0 done / 20 gave_up · 141 pending` within 90 seconds.

## Files I'll touch

- `src/components/AutomationHealthPanel.tsx` — show full function return payload in toast; add "Drain queue" inline button on the enqueue row when queue is non-empty
- `supabase/functions/process-fireflies-backfill-queue/index.ts` — fail-fast on `not_in_fireflies_api`, only backoff on real errors
- One `supabase--curl_edge_functions` call to force-tick the drainer right after deploy

## What you'll see within 2 minutes of the build

- Click any "Run" button → toast shows the function's actual return data (no more silent "screen reload" feeling)
- Backfill progress widget jumps from `0 / 161 (0%)` → roughly `0 done / 20 gave_up / 141 pending (12%)` within 90s
- Within 40 minutes: full classification — likely a small handful matched, the rest marked `gave_up: not_in_fireflies_api` (Fireflies retention limit, not a code bug)
- The "enqueue" row now visibly explains why clicking it is a no-op when the queue is full, and gives you a one-click path to the right action

