

# Process Only Leads Without Meetings

## Problem
The current "Process All" button processes every lead (skipping only those with a prior `completed` bulk job in `processing_jobs`). This is fragile — it relies on job history rather than actual lead state. Leads that already have Fireflies meetings attached should be left untouched.

## Design

### Filter: leads with 0 meetings
The safest, most direct filter is checking the lead's `meetings` JSONB array. A lead needs processing if `meetings` is empty (`[]`). This is ground truth — no dependency on job history.

### Configurable count
Instead of processing all unprocessed leads at once, the dialog lets the user specify how many to process (with a sensible default showing total available). This gives control over time/cost.

## Changes

### 1. Update `BulkProcessingDialog` 
- Query leads where `meetings = '[]'` (empty array) to get the count of unprocessed leads
- Add a number input field: "How many leads to process?" defaulting to the total unprocessed count
- Pass the count to `startBulkProcessing(count)`
- Update copy to explain it only processes leads without meetings

### 2. Update `startBulkProcessing` in `ProcessingContext.tsx`
- Accept an optional `limit?: number` parameter
- Replace the current filter logic (checking `processing_jobs` for completed bulk jobs) with a simpler, safer filter: `leads.filter(l => !l.meetings || l.meetings.length === 0)`
- If `limit` is provided, slice the filtered list to that count
- Keep everything else the same (sequential processing, pause/cancel, etc.)

### 3. Remove the old `processing_jobs`-based skip logic
The old approach checked for completed bulk jobs in the DB. The new approach checks actual lead state (meetings array), which is more reliable and doesn't require a DB query.

## Safety Considerations
- **No re-processing risk**: Leads with any meetings (even 1) are excluded entirely
- **Cancellable**: Existing pause/cancel mechanism still works
- **Progress saved**: Each lead's results are applied as soon as its job completes
- **Rate limiting**: Existing 1.5s delays between jobs preserved

## Files Changed
| File | Change |
|------|--------|
| `src/contexts/ProcessingContext.tsx` | `startBulkProcessing(limit?)` — filter by empty meetings array, apply limit |
| `src/components/BulkProcessingDialog.tsx` | Add count input, show unprocessed count, pass limit |

