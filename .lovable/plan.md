

# Plan: Fix Cancel Not Clearing Active Spinners

## Problem
Two issues:
1. `cancelBulk` stops the loop but doesn't clear `leadJobs` state — so any lead currently showing "Searching..." keeps spinning in the UI forever.
2. On hydration, stale `queued`/`processing` jobs from a cancelled bulk run get picked up and shown as active again.

## Solution

### `src/contexts/ProcessingContext.tsx`

1. **In `cancelBulk`** — also clear all `leadJobs` and mark any in-flight `queued`/`processing` bulk jobs as `acknowledged` in the database so they don't resurface on reload:
```typescript
const cancelBulk = useCallback(() => {
  cancelledRef.current = true;
  if (resumeResolverRef.current) {
    resumeResolverRef.current();
    resumeResolverRef.current = null;
  }
  // Clear all searching indicators
  setLeadJobs({});
  setBulkJob(prev => ({ ...prev, cancelled: true, phase: "done", progressMessage: "Cancelled" }));
  
  // Mark any in-flight bulk jobs as acknowledged so they don't rehydrate
  (supabase.from("processing_jobs") as any)
    .update({ acknowledged: true })
    .eq("job_type", "bulk")
    .in("status", ["queued", "processing"])
    .then();
}, []);
```

2. **In `dismissBulk`** — also clear `leadJobs`:
```typescript
const dismissBulk = useCallback(() => {
  setBulkJob(INITIAL_BULK);
  setLeadJobs({});
}, []);
```

Single file change. No database or edge function modifications needed.

