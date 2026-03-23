

# Fix: Deduplicate Meetings for Affected Leads

## Problem

The two migrations ran in sequence:
1. First migration deleted meetings with transcript < 50 chars (emptied the array)
2. Second migration tagged meetings with `noRecording: true` — but since re-processing re-fetched from Fireflies, it created **new entries alongside old ones** with the same `firefliesId`

Result: 7 entries for CT-051 where there should be 4. Three meetings are duplicated (once raw, once tagged), and one (Jan 6) was never tagged.

## Fix

### 1. Database cleanup migration
Run a single SQL migration that for each affected lead:
- Deduplicates by `firefliesId` — keep only one entry per unique ID
- For entries with transcript < 50 chars, ensure `noRecording: true` is set
- This covers all 5 affected leads

```sql
UPDATE leads
SET meetings = (
  SELECT COALESCE(jsonb_agg(deduped), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (m->>'firefliesId')
      CASE 
        WHEN length(COALESCE(m->>'transcript', '')) < 50
        THEN m || '{"noRecording": true, "summary": "No recording available"}'::jsonb
        ELSE m
      END as deduped
    FROM jsonb_array_elements(meetings) m
    ORDER BY m->>'firefliesId', (m->>'noRecording') DESC NULLS LAST
  ) sub
)
WHERE id IN ('CT-051', 'CT-036', 'SC-T-026', 'CT-044', 'SC-I-032');
```

### 2. Fix dedup guard in `run-lead-job`
Ensure the edge function's existing `firefliesId` dedup check covers both tagged and untagged entries so this can't recur.

## Files Changed

| File | Change |
|------|--------|
| DB migration | Deduplicate meetings by firefliesId, tag all empty-transcript entries |
| `supabase/functions/run-lead-job/index.ts` | Verify dedup guard uses firefliesId correctly (read-only check) |

## Expected Result
CT-051 will have exactly 4 meetings, all tagged `noRecording: true` (since none have real transcripts).

