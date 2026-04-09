

# Clean Up Stuck Jobs + Process 3 Remaining Leads

## Current State

- 118 of 120 no-meeting leads have been searched — Fireflies returned nothing because they never scheduled a Calendly meeting
- 2 jobs are stuck in "processing" (John Matthews, Cordelia Shackleton) from the last backfill
- 1 lead (Odanette Isaac) was never queued

After this, every lead will have been searched. Future processing only needs to happen when new leads arrive or new Calendly bookings come in.

## Plan

### 1. Mark the 2 stuck processing jobs as failed

In `ProcessingContext.tsx`, the mount-time hydration already handles this for jobs older than 15 minutes. But these jobs are now hours old and may have been acknowledged already. Add a one-time cleanup on mount: any `processing` job older than 30 minutes gets marked `failed` + `acknowledged`, and the local `leadJobs` state is cleared for those leads.

### 2. Re-queue the 3 unprocessed leads automatically

After cleanup, the next "Backfill All" click will pick up these 3 leads (the DB-direct discovery query already checks for leads without a `completed` processing job). No code change needed — just click the button after the stuck jobs are cleared.

**Alternatively**, we can add a small fix: during the zombie cleanup on mount, if we find stuck bulk jobs, automatically re-queue them instead of just failing them. This would be more resilient for future runs too.

### 3. No other action needed

The 118 leads with no meetings are genuinely empty — no Calendly booking means no Fireflies transcript. The system worked correctly for them.

## Files Changed

| File | Changes |
|------|---------|
| `src/contexts/ProcessingContext.tsx` | Extend mount-time cleanup to mark very old (>30min) stuck `processing` jobs as `failed` + `acknowledged`, clearing local state. This ensures the 2 stuck jobs don't block future backfills. |

