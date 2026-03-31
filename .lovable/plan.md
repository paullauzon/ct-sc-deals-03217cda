

# Only Process Truly Unprocessed Leads

## Problem
The bulk processing dialog counts 119 leads with no meetings, but 190 leads have already been through the processing pipeline (tracked in `processing_jobs` table). Many of those 119 simply had no matching Fireflies transcripts — they don't need re-processing. Only **19 leads** have never been processed at all.

## Fix
Query the `processing_jobs` table to get all lead IDs that have already been processed (status = `done` or `completed`), then exclude them from the "unprocessed" count.

### Changes in `src/components/BulkProcessingDialog.tsx`
- On dialog open, fetch distinct `lead_id` values from `processing_jobs` where status is `done` or `completed`
- Filter leads to only those with **no meetings AND no completed processing job**
- Update the count and messaging accordingly ("19 leads have never been processed")

### Changes in `src/contexts/ProcessingContext.tsx`
- In `startBulkProcessing`, apply the same exclusion filter: skip leads that already have a completed job in `processing_jobs`, even if they have no meetings

## Updated Dialog Copy
```
19 of 209 leads have never been processed.
(90 additional leads were processed but had no matching transcripts.)
```

## Files Changed
| File | Change |
|------|--------|
| `src/components/BulkProcessingDialog.tsx` | Fetch processed lead IDs from DB, exclude from count |
| `src/contexts/ProcessingContext.tsx` | Same exclusion in `startBulkProcessing` filter |

