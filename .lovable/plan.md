

# Verification + the missing piece that's hiding all the activity

## Ground truth (just verified live)

| Signal | Reality | Verdict |
|---|---|---|
| Backfill queue | **24 gave_up · 137 pending** (was 0/161) | Working |
| Cron ticks | Last 8 ticks all logged successfully (15:05, 15:06, 15:07, …) | Healthy |
| Per-item logs | Every lead emits an `item` row (`gave_up · not_in_fireflies_api`) | Healthy |
| Heartbeats | Every tick writes a `heartbeat:true` row within ~300ms | Healthy |
| Realtime publication on `cron_run_log` | **NOT enabled** | **Bug** |
| Realtime publication on `fireflies_retry_queue` | **NOT enabled** | **Bug** |

Bottom line: the **backend is doing everything correctly**, but the drawer is staring at a Realtime channel that has nothing to deliver because neither table is in the `supabase_realtime` publication. That's why your drawer screenshot says "Waiting for first heartbeat…" 5 seconds in even though a heartbeat was just written to disk.

## Why "0 done" but 24 classified?

The drawer's "Backlog: 138 pending · 23 gave up · 0 done" is correct — `done` only ticks up when Fireflies *recovers* a transcript. The 23 `gave_up` are leads where Fireflies' API confirmed it has no recording (likely past their ~90 day retention). That's a permanent terminal state, not a failure.

After full drain, expect: **~150 gave_up + maybe 5-10 done**. The recovery rate is low because the booked meetings are old enough that Fireflies discarded the transcripts.

## What I need to fix (one migration + one drawer polish)

### 1. Enable Realtime on both tables (migration)

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.cron_run_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fireflies_retry_queue;
ALTER TABLE public.cron_run_log REPLICA IDENTITY FULL;
ALTER TABLE public.fireflies_retry_queue REPLICA IDENTITY FULL;
```

This is the only reason the drawer looks dead. After this lands, every heartbeat and per-lead classification streams into the drawer within 100-300ms of the database commit.

### 2. Add a polling fallback to the drawer (belt + suspenders)

Even with Realtime enabled, add a 3-second poll that fetches new `cron_run_log` rows for this `job_name` since the drawer opened. This guarantees events render even if the Realtime channel disconnects. The poll de-dupes against existing events (already handled by `pushEvent`).

### 3. "Final results" panel after run completes

When the drawer finishes (the function returns OR all in-flight ticks settle), show a clean summary block:

```text
┌───────────────────────────────────────────────┐
│ FINAL RESULTS                                 │
│                                               │
│ Backlog drained                               │
│   ✓ 7 leads classified this drawer session    │
│   ✓ 0 transcripts recovered                   │
│   ✓ 7 marked "not in Fireflies API"           │
│                                               │
│ Remaining backlog                             │
│   • 130 leads pending — next cron tick in 4m  │
│   • Estimated full drain: ~2.5 hours          │
│                                               │
│ [ Show me the recovered leads ] (if any)      │
│ [ Show me the gave-up leads ]                 │
└───────────────────────────────────────────────┘
```

The "Show me the …" buttons filter the leads grid to those touched in this session (using the lead IDs we streamed) so you can audit each outcome.

## Files

- **NEW migration** — `ALTER PUBLICATION supabase_realtime ADD TABLE …` for both tables + `REPLICA IDENTITY FULL`
- **MODIFY `src/components/AutomationRunDrawer.tsx`**:
  - Add 3-second polling fallback for `cron_run_log` rows since `startedAt`
  - Add "Final results" summary block after status flips to `done`/`killed`
  - Add two action buttons that emit a custom event the parent can listen to (or just deep-link to a filtered leads view)

## What you'll see right after this lands

1. Click ▷ → drawer opens
2. Within 1 second: `Heartbeat logged · claimed 5 rows`
3. Every 5-30 seconds for the next ~90s: `Lead CT-XXX → gave_up (not_in_fireflies_api)` lines stream in
4. Final summary card shows counts + actionable filter links
5. Drawer pill flips from `LIVE` → `DONE` (or `GATEWAY KILL` if the function ran past 150s — same story, work still committed)

