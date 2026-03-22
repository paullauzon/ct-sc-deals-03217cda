

# Fix: Bulk Processing Timeouts

## Root Cause

Two issues causing Brady Blackett (and others) to fail:

1. **Client-side catch kills running jobs**: When `supabase.functions.invoke()` returns "Failed to fetch" (browser HTTP timeout ~2 min), the `.catch()` handler marks the job as `"failed"` in the DB — even though the edge function is still running server-side. This races with the edge function's own completion update.

2. **5-minute client timeout is too short**: `waitForJobCompletion` resolves as "failed" after 5 minutes. But `run-lead-job` calls `fetch-fireflies` twice (Captarget + SourceCo with 3s delay), then does AI processing per meeting + deal intelligence synthesis. For leads with multiple meetings, this can exceed 5 minutes.

The screenshot confirms both: Brady Blackett shows "Timed out after 5 minutes" while the edge function was likely still processing.

## Fix Plan

### 1. Remove the destructive `.catch()` in `ProcessingContext.tsx`

The `.catch()` on `supabase.functions.invoke` currently marks the job as failed in the DB. This is wrong — the edge function continues running server-side regardless of the HTTP response. Change it to just log the error, not update the DB.

```
// Before (destructive):
.catch(async (e) => {
  await supabase.from("processing_jobs")
    .update({ status: "failed", error: ... })
    .eq("id", jobRow.id);
});

// After (safe):
.catch((e) => {
  console.warn(`HTTP timeout for ${lead.name} — edge function continues server-side`);
});
```

### 2. Increase `waitForJobCompletion` timeout from 5 to 10 minutes

The edge function can legitimately take 5+ minutes for leads with multiple meetings. Increase the safety timeout to 10 minutes to match the server-side stale job detection (also 10 min).

### 3. Add retry logic for timed-out jobs

When `waitForJobCompletion` times out, check the actual job status in the DB before declaring failure. The job may have completed while we were waiting (race condition). If it's still "processing", don't mark it failed — just report it as "still running" and move on.

## Files Changed

| File | Change |
|------|--------|
| `src/contexts/ProcessingContext.tsx` | Remove destructive `.catch()`, increase timeout to 10 min, add DB status check on timeout |

## Why This Fixes Brady Blackett

His edge function was running fine server-side. The browser's HTTP fetch timed out → `.catch()` marked the job as "failed" in the DB → the edge function's eventual completion was ignored (job already acknowledged). With these fixes, the client just waits patiently for the DB update from the server.

