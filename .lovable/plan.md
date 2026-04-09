

# Fix Bulk Processing: Use DB-Direct Lead Discovery

## Problem

The `startBulkProcessing` function reads `leadsRef.current` to find leads to process. But when called immediately after `refreshLeads()`, React hasn't re-rendered yet — so `leadsRef.current` still holds the OLD lead list. This means most unprocessed leads are missed.

This is why only 1 lead (Ray French) was processed instead of the ~124 that actually need processing.

## Fix

Make `startBulkProcessing` query the database directly for leads to process, instead of relying on the React state ref. This eliminates the race condition entirely.

### Changes to `src/contexts/ProcessingContext.tsx`

In `startBulkProcessing`:
- Replace `const currentLeads = leadsRef.current` + in-memory filtering with a direct Supabase query:
  ```sql
  SELECT id, name, email, company, company_url, buyer_type, source, message, meetings
  FROM leads
  WHERE archived_at IS NULL AND meetings = '[]'
  ```
- Then exclude leads with completed processing jobs (already done)
- Map DB rows to the lead payload format needed by `run-lead-job`
- This ensures we always get the freshest data, regardless of React render timing

### No changes needed to LeadsTable.tsx or Pipeline.tsx

The backfill handlers already call `refreshLeads()` for UI freshness, but the actual lead discovery for processing will now be DB-driven.

## Files Changed

| File | Changes |
|------|---------|
| `src/contexts/ProcessingContext.tsx` | Replace `leadsRef.current` filtering in `startBulkProcessing` with a direct DB query for unprocessed leads. Map DB rows to the payload format needed by the processing loop. |

