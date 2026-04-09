

# Fix Bulk Processing Reliability

## What Happened
- Calendly sync worked fine (5 new matches)
- Fireflies bulk processed only 8/98 leads, then the Myall Budden job got stuck and the loop died
- 90 leads remain unprocessed
- The overlay wasn't rendered at the time, so you saw nothing

## Root Causes
1. **Zombie cleanup is too aggressive**: The 2-minute periodic cleanup marks jobs older than 10 minutes as timed out. But a single Fireflies scan can take 2-3 minutes, and the client-side loop was killed when the page reloaded during the code deploy
2. **No resume capability**: If the loop dies mid-run (page refresh, code deploy, network glitch), there's no way to pick up where it left off — you have to start over, but `processedIds` excludes already-completed leads, so it skips them. The issue is the loop function itself is gone from memory
3. **Myall Budden is stuck**: Still sitting as `processing` / `acknowledged: false`, blocking the overlay

## Plan

### 1. Clean up stuck Myall Budden job
Mark the stuck job as failed so it's cleared from the UI.

### 2. Increase zombie timeout to 15 minutes
The current 10-minute window is too tight for leads that require scanning 1000+ Fireflies transcripts. Increase to 15 minutes in both the periodic cleanup and the `isStaleJob` check.

### 3. Add a "Resume" detection on mount
When the page loads, check if there are unprocessed leads that should have been part of a bulk run. If the bulk phase is "idle" but there are still queued/processing jobs, show a toast offering to resume.

### 4. Make the backfill button re-runnable
Currently `startBulkProcessing` correctly queries the DB for leads with `meetings = '[]'` and excludes leads with completed processing jobs. This means clicking "Backfill All Meetings" again will pick up the remaining ~90 leads. The fix is just to ensure the stuck Myall Budden job doesn't block things.

### 5. Show the overlay immediately on button click
Add a brief "Starting..." state so you see feedback within 1 second of clicking, before the DB queries complete.

## Files Changed

| File | Changes |
|------|---------|
| `src/contexts/ProcessingContext.tsx` | Increase stale job timeout from 10 to 15 minutes. Add immediate "Starting..." feedback before DB queries. On mount, auto-fail the stuck Myall Budden job (and any stuck processing jobs). |
| `src/components/Pipeline.tsx` | Add toast feedback immediately when button is clicked (before Calendly sync starts). |
| `src/components/LeadsTable.tsx` | Same immediate feedback fix. |

