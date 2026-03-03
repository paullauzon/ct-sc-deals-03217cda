

# Fix: Bulk Processing Failing Due to Massive Transcript Fetch

## Root Cause

The bulk processing flow tries to download **all 1000 transcripts** from both Fireflies accounts upfront (client-side), then match them to leads. This causes:

1. **Edge function timeout**: Fetching 1000 full transcripts (2 at a time = 500 sequential API calls) exceeds the ~150s edge function limit
2. **Fireflies 429 rate limiting**: 500+ rapid API calls trigger rate limits with 30+ second retry waits
3. **Payload overflow**: 1000 full transcripts can be 100MB+ — impossible to return in a single response

The logs confirm this: `fetch-fireflies` fetches all 20 metadata batches (1000 meetings), then immediately hits 429s trying to fetch full transcripts, and the edge function shuts down before completing.

## Fix: Eliminate Client-Side Bulk Fetch

Instead of pre-fetching all transcripts and matching client-side, the bulk flow should create a `run-lead-job` for **every lead** and let each job fetch only its own relevant transcripts using the targeted search that already exists in `run-lead-job`.

### Changes

**`src/contexts/ProcessingContext.tsx`** — `startBulkProcessing`:
- Remove the `fetchAllTranscripts` calls (Phase 1) and client-side `matchTranscriptToLeads` (Phase 2)
- Instead, create a `run-lead-job` for every lead (without `prefetchedMeetings`) and invoke them sequentially with concurrency=2
- Each `run-lead-job` already builds search params (email, domain, name, company) and calls `fetch-fireflies` with those filters — this fetches only 1-5 relevant transcripts per lead instead of 1000

**`src/lib/bulkProcessing.ts`** — No changes needed (the `fetchAllTranscripts` function can remain for other uses but won't be called during bulk)

**`supabase/functions/run-lead-job/index.ts`** — Minor: add a delay between the two `fetch-fireflies` calls (Captarget + SourceCo) to avoid concurrent 429s

### Result
- Each lead's job fetches ~1-5 transcripts instead of 1000
- No single edge function call exceeds timeout
- Fireflies rate limits are naturally respected via sequential processing
- Failed individual leads don't block others

