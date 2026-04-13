

# Fix "Backfill All" to Re-scan Leads with No Meetings Found

## Problem
The "Backfill All Meetings" button skips leads that were previously scanned but had no Fireflies match. 20 leads with `stage = Meeting Set` and `meetings = []` are permanently excluded because they have `completed` processing jobs — even though those jobs found nothing.

## Root Cause
Both the backfill button (LeadsTable.tsx line 1172-1176) and `startBulkProcessing` (ProcessingContext.tsx line 406-410) exclude leads if they have ANY `completed` processing job. They should only exclude leads whose completed jobs actually found meetings.

## Fix

### 1. Update LeadsTable.tsx backfill button logic (line 1172)
Change the `processing_jobs` query to only fetch jobs that actually found meetings:
```sql
SELECT lead_id FROM processing_jobs 
WHERE status IN ('done','completed') 
AND new_meetings != '[]'
```

### 2. Update ProcessingContext.tsx `startBulkProcessing` (line 406-410)
Same change — only treat leads as "already processed" if a prior job found meetings:
```sql
SELECT lead_id FROM processing_jobs 
WHERE status IN ('done','completed') 
AND new_meetings != '[]'
```

### 3. Update BulkProcessingDialog.tsx (line 27-29)
Same fix for the count display in the dialog.

## Files Changed
| File | Change |
|------|--------|
| `src/components/LeadsTable.tsx` | Filter completed jobs to only those with non-empty `new_meetings` |
| `src/contexts/ProcessingContext.tsx` | Same filter in `startBulkProcessing` |
| `src/components/BulkProcessingDialog.tsx` | Same filter for the unprocessed count |

This ensures leads that were scanned but had no Fireflies match will be re-scanned on subsequent backfill runs.

