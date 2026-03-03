

# Fix: Bulk Processing Edge Function Failures

## Root Causes Identified

1. **Payload size overflow**: Bulk processing sends full transcripts (can be 50K+ chars each) inside `prefetchedMeetings` to `run-lead-job`. When a lead matches multiple transcripts, the request body can exceed the edge function's ~6MB limit, causing `Failed to send request to the edge function`.

2. **Concurrent invocation flood**: All `run-lead-job` calls fire simultaneously (fire-and-forget loop on line 407). With 20-50+ leads, this overwhelms the edge function runtime — each invocation then calls `process-meeting` and `synthesize-deal-intelligence`, creating a cascade of concurrent AI calls.

3. **Fireflies API rate limiting**: Confirmed in logs — `fetch-fireflies` hits 429 errors when fetching full transcripts in parallel batches.

## Fix Plan

### 1. Trim transcript payloads in prefetched meetings
In `ProcessingContext.tsx`, truncate each transcript in `prefetchedMeetings` to 15,000 chars before sending to `run-lead-job`. This prevents oversized request bodies while preserving enough content for AI processing.

### 2. Sequential edge function invocation with concurrency limit
Replace the fire-and-forget loop with a sequential queue that processes 2-3 leads at a time max. After each `run-lead-job` invocation resolves (or fails), move to the next. This prevents overwhelming the edge runtime.

### 3. Add retry with backoff for Fireflies 429 errors
In `fetch-fireflies/index.ts`, add exponential backoff retry (up to 3 attempts) when Fireflies returns 429. The response already includes a `retryAfter` timestamp we can use.

### 4. Better error surfacing
The current `.catch(e => console.error(...))` silently swallows invocation failures. Change to update the job status to "failed" in the database and show a toast, so the user sees which leads failed and why.

## Files to Change

| File | Change |
|------|--------|
| `src/contexts/ProcessingContext.tsx` | Truncate transcripts in prefetched payload; add sequential invocation queue (max 2 concurrent); surface errors via toast |
| `supabase/functions/fetch-fireflies/index.ts` | Add retry with backoff for 429 responses from Fireflies API |
| `supabase/functions/run-lead-job/index.ts` | Truncate incoming transcripts defensively; add timeout handling for sub-function calls |

