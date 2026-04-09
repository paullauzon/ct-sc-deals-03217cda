

# Fix Bulk Processing + Show Background Progress

## What happened

- Calendly backfill worked: 5 new leads matched and advanced to "Meeting Set"
- Fireflies bulk processing failed to start properly — only 1 lead (Adam Haile) was queued before a network timeout killed the flow
- 2 Adam Haile jobs are stuck in "processing" status (Fireflies hit 429 rate limits)
- 97 New Leads still have no meetings and were never queued
- The UI shows nothing because the bulk job phase was never properly initialized

## Fixes

### 1. Clean up stuck jobs + retry bulk queue

The backfill button handler in Pipeline.tsx and LeadsTable.tsx needs to:
- After Calendly backfill completes, refresh leads data to get updated stages
- Then count truly unprocessed leads (New Lead + no meetings + no completed processing job)
- Call `startBulkProcessing()` with the correct count so the overlay activates

The current code calls `startBulkProcessing` before the Calendly response comes back, and if the count is 0 or the call errors, the overlay never shows.

### 2. Fix the backfill button flow

Current issue: the button calls Calendly backfill, then immediately tries to count unprocessed leads and start bulk processing — but the leads data hasn't been refreshed yet after Calendly updated some leads. The count is stale.

Fix: After Calendly backfill returns, call `refreshLeads()` to reload from DB, then compute the unprocessed count from fresh data, then call `startBulkProcessing()`.

### 3. Mark zombie jobs as failed

Add cleanup logic: before starting new bulk processing, mark any old `processing` or `queued` jobs older than 10 minutes as `acknowledged` so they don't interfere.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Fix backfill handler: await Calendly response, refresh leads, compute unprocessed from fresh data, then start bulk processing. Add zombie job cleanup before starting. |
| `src/components/LeadsTable.tsx` | Same fix to backfill handler. |

