

# Fix Backfill Flow: Refresh Context Before Bulk Processing

## Problem

The backfill button in LeadsTable and Pipeline:
1. Runs Calendly sync ✓
2. Queries DB directly for unprocessed leads ✓
3. Calls `startBulkProcessing(count)` — but `startBulkProcessing` ignores the count parameter for lead selection. It re-derives leads from `leadsRef.current` (the React context state), which hasn't been refreshed after Calendly updated some leads.

Result: the overlay may show wrong leads, re-process already-handled ones, or find 0.

## Fix

1. **Call `refreshLeads()` after Calendly sync** so the context has fresh data before `startBulkProcessing` runs
2. `refreshLeads` is already exposed by `LeadContext` — just need to await it before starting bulk processing

The `startBulkProcessing` function already does its own DB query for `processing_jobs` to exclude done leads, and filters `leadsRef.current` for leads with no meetings. After a `refreshLeads()`, this will work correctly because:
- Calendly-matched leads now have `meetings` data → filtered out
- Archived leads are excluded by the context query
- Only truly unprocessed leads remain

## Files Changed

| File | Changes |
|------|---------|
| `src/components/LeadsTable.tsx` | After Calendly sync toast, call `await refreshLeads()` before computing unprocessed count and calling `startBulkProcessing`. Import `refreshLeads` from context. |
| `src/components/Pipeline.tsx` | Same fix — add `await refreshLeads()` after Calendly sync, before bulk processing. |

