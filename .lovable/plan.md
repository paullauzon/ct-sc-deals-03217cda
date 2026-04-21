

# Live Automation Progress Drawer

## What you'll get

When you click ▷ on any automation row, instead of "fire and wait for one toast," a slide-out **Run Drawer** opens immediately and streams everything happening — heartbeats, items processed, errors, partial results — in real time, until the function ends (or until the gateway kills it).

## How it will look

```text
┌─────────────────────────────────────────────────────────┐
│ ▶ Fireflies backfill queue                       LIVE • │
│ Started 14:52:03 · 47s elapsed                          │
├─────────────────────────────────────────────────────────┤
│ Progress                                                │
│  ▓▓▓▓▓▓░░░░░░░░░░  3 / 5 leads (this tick)              │
│  Backlog: 145 pending · 16 gave up · 0 matched          │
│                                                         │
│ Live event stream                                       │
│  14:52:03  ▶ invoked process-fireflies-backfill-queue   │
│  14:52:04  • heartbeat logged · claimed 5 rows          │
│  14:52:09  ✓ lead a3f1… not in Fireflies API → gave_up  │
│  14:52:31  ✓ lead 9b22… not in Fireflies API → gave_up  │
│  14:52:48  ⏳ fetching lead c7e9…                        │
│  …                                                       │
│                                                         │
│ Final result (when done)                                │
│  processed 3 · recovered 0 · gave up 3 · 142 pending    │
└─────────────────────────────────────────────────────────┘
```

## What changes

### 1. New `RunDrawer` component (`src/components/AutomationRunDrawer.tsx`)
A right-side `Sheet` that opens the moment you click ▷. It shows:
- Function name, start time, live elapsed seconds
- A **live event stream** (newest at bottom) of every heartbeat / per-item update
- A mini progress bar with current-batch and overall-backlog counts
- The final JSON return when the function completes
- "Working" indicator that pulses while the run is live, switches to "Done" / "Errored" / "Timed out by gateway" at the end

### 2. Live data sources (no polling guesswork)
The drawer combines three live feeds via Supabase Realtime:
- **`cron_run_log`** — listens for new INSERTs filtered by `job_name`, so each `heartbeat: true` and final row appears as it commits
- **`fireflies_retry_queue`** — listens for UPDATEs on backfill rows, so per-lead status flips (`pending → done/gave_up`) stream in
- **Function return payload** — when the `invoke()` promise resolves (or rejects with timeout), the final summary lands in the same stream

This works for every job because all of them already use the shared `logCronRun` helper. For jobs that don't write per-item rows, the stream simply shows: invoked → heartbeat (if any) → final result.

### 3. Wire into AutomationHealthPanel
- Replace today's "fire toast and forget" `runNow()` with: open the drawer, then invoke the function in the background. The drawer owns the rest of the UX.
- Keep the existing toast as a fallback for the "Run all daily" button (which fires 5 jobs in parallel — drawer doesn't make sense there).
- Add a small **"View live"** link on every row's status cell so you can re-open the drawer for the most recent run any time, even after closing it.

### 4. Coverage for gateway-killed runs
If `invoke()` throws "context canceled" or "504", the drawer doesn't show "Failed." It shows: **"Edge gateway killed the request after 150s — Postgres updates already committed are visible above. The function will continue on its next cron tick."** This matches reality (we already verified work commits before the kill).

### 5. Persist last-run snapshot per job
The drawer stores the last-completed run in `localStorage` keyed by job name, so reopening it shows the previous result instantly instead of an empty drawer until the next click.

## Files

- **NEW** `src/components/AutomationRunDrawer.tsx` — the live drawer (Realtime subscriptions, event log, progress bar, final summary)
- **MODIFY** `src/components/AutomationHealthPanel.tsx` — open drawer instead of one-shot toast; add "View live" link per row
- **MODIFY** `supabase/functions/process-fireflies-backfill-queue/index.ts` — emit one extra `logCronRun(..., "success", n, { item: leadId, classification })` after every per-lead decision, so the drawer's event stream is dense (not just two heartbeats). Skip if it would push us past the 90s wall budget.

## Why this fixes the "I clicked and nothing happened" problem permanently

You'll never again wonder if a click did anything. The drawer opens in <100ms, shows "invoked," then streams every database commit live. Even if the gateway kills the function, you see exactly what got done before the kill — and the drawer tells you the next cron tick will pick up where this one stopped.

