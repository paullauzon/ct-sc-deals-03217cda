

# Plan: Fix Stuck Notifications + Clean Up Stale Jobs

## Root Cause

Two issues:

1. **12 jobs stuck in `processing` status** in the database — their edge functions timed out (e.g., Valeria Rivera had 107 meetings). They never reached `completed` or `failed`, so they're never acknowledged.

2. **On page load**, the hydration code (lines 219-223 of ProcessingContext) picks up all unacknowledged `processing` jobs and adds them to `leadJobs` as `searching: true`. Since no further status update arrives, they display "Searching for..." forever.

## Solution

### 1. Database cleanup: Mark stale jobs as failed
Run a migration/query to mark the 12 stuck `processing` jobs as `failed` with a meaningful error, and set them as `acknowledged`:
```sql
UPDATE processing_jobs 
SET status = 'failed', 
    error = 'Timed out — edge function did not complete', 
    acknowledged = true 
WHERE status = 'processing';
```

### 2. `src/contexts/ProcessingContext.tsx` — Add stale job detection on hydration

During hydration, check if a `processing` job is older than ~10 minutes. If so, treat it as failed instead of showing "Searching...":

- Compare `job.created_at` (or `updated_at`) against `Date.now()`
- If older than 10 minutes, mark it as failed in the DB and skip adding it to `leadJobs`
- This prevents future stuck notifications from ever appearing

### 3. `src/contexts/ProcessingContext.tsx` — Same for realtime subscription

Add a similar age check in the realtime handler for `processing` status events — if the job is stale, ignore it rather than showing a spinner.

### Files
| File | Change |
|------|------|
| Database migration | One-time cleanup of 12 stuck jobs |
| `src/contexts/ProcessingContext.tsx` | Add stale job detection (>10 min) during hydration and realtime, auto-mark as failed |

