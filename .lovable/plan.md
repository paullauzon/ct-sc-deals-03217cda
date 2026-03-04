

# Plan: Skip Already-Processed Leads in Bulk Processing

## Problem
`startBulkProcessing` iterates over **all** leads and reprocesses every one. It doesn't check if a lead already has a completed `processing_jobs` record, so clicking "Process All" again reruns the entire 168-lead pipeline.

## Solution
Before starting the bulk loop, query `processing_jobs` for all leads with `status = 'completed'` and `job_type = 'bulk'`, then filter them out so only unprocessed leads enter the loop.

## Changes

### `src/contexts/ProcessingContext.tsx`
In `startBulkProcessing` (around line 304):

1. Before the loop, fetch completed lead IDs:
```typescript
const { data: completedJobs } = await supabase
  .from("processing_jobs")
  .select("lead_id")
  .eq("status", "completed")
  .eq("job_type", "bulk");

const completedLeadIds = new Set((completedJobs || []).map(j => j.lead_id));
const leadsToProcess = currentLeads.filter(l => !completedLeadIds.has(l.id));
```

2. Use `leadsToProcess` instead of `currentLeads` for `total` and the `for` loop.

3. If `leadsToProcess` is empty, show a toast "All leads already processed" and return.

This is the only file that needs changing. No database or edge function changes required.

