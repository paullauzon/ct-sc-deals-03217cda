

# Fix LinkedIn Enrich Button — 0/0 Profiles Issue

## Problem
The LinkedIn Enrich button calls `backfill-linkedin` without `retryFailed: true`. The function has two modes:
- **Default**: Only processes leads where `linkedin_url IS NULL` (never searched)
- **retryFailed=true**: Re-processes leads where `linkedin_url = ''` (previously failed)

Your new leads (CT-219, CT-220, and others like CT-200, CT-201) already had their `linkedin_url` set to `''` by earlier failed attempts, so the default mode sees 0 leads to process.

## Fix
1. **Update the LinkedIn Enrich button** in `LeadsTable.tsx` to pass `{ retry_failed: true }` in the function body, so it re-attempts previously failed leads
2. **Also reset `linkedin_url` to NULL** for CT-219 and CT-220 via a quick DB update, so they're picked up even without retry mode (belt and suspenders)

## Files to Change
- `src/components/LeadsTable.tsx` — add `body: { retry_failed: true }` to the `supabase.functions.invoke("backfill-linkedin")` call

## Database Fix
- Run: `UPDATE leads SET linkedin_url = NULL WHERE id IN ('CT-219', 'CT-220', 'CT-200', 'CT-201')`

