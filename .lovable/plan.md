

# Fix: End-to-End Bulk Processing Reliability

## Problems Found

### 1. Edge functions dying mid-execution (server-side timeout)
The `run-lead-job` edge function exceeds Supabase's ~400s wall-clock limit. Root cause: the **speaker-name fallback** in `fetch-fireflies` scans 1000 transcripts per brand (20 batches x 50), taking ~70s each. With two brands + AI processing + deal intelligence synthesis, total time easily exceeds 400s. When the edge function is killed, the DB is left with `status: "processing"` forever.

Evidence: Brady's job shows `progress_message: "Synthesizing deal intelligence..."` but `new_meetings: []` — it was killed before writing results. Blake Jackman's job stuck at "AI analyzing meeting 3/4".

### 2. Meetings not persisting to DB despite successful jobs
Brady had a **completed** job on March 4 with 2 meetings found, and it was acknowledged. But the lead still shows 0 meetings in the DB. The `applyCompletedJob` function acknowledges the job fire-and-forget BEFORE confirming the lead update succeeded. If the DB write fails silently, the meetings are lost and the job can never be retried.

### 3. Zombie "processing" jobs blocking future runs
Jobs stuck as `processing` + `acknowledged: true` (from cancel) or `processing` + `acknowledged: false` (from server death) pile up. While the stale detector catches some on mount, it doesn't run periodically during the session.

## Fix Plan

### Step 1: Reduce speaker-name fallback scope
**File:** `supabase/functions/fetch-fireflies/index.ts`
- Reduce `MAX_SCAN_BATCHES` from 20 to 5 (scan 250 recent transcripts instead of 1000)
- This cuts the fallback from ~70s to ~18s per brand, keeping the overall edge function under 400s

### Step 2: Add elapsed-time guard to run-lead-job
**File:** `supabase/functions/run-lead-job/index.ts`
- Track start time; before each major step (AI call, synthesis), check if >300s elapsed
- If approaching timeout, write partial results to DB and return — better to save 2 of 4 meetings than lose all
- Add a timeout to the `synthesize-deal-intelligence` sub-call (30s) so it doesn't block indefinitely

### Step 3: Ensure meetings persist before acknowledging
**File:** `src/contexts/ProcessingContext.tsx`
- In `applyCompletedJob`, `await` the `updateLeadInDb` call (via `updateLead`) before acknowledging the job
- If the DB write fails, do NOT acknowledge — the job will be retried on next page load
- Currently `updateLead` fires the DB write and forgets; add a callback or check pattern to confirm persistence

### Step 4: Clean up zombie jobs on mount
**File:** `src/contexts/ProcessingContext.tsx`
- In the hydration `useEffect`, also clean up any jobs with `status: "processing"` and `acknowledged: true` (left over from cancelled bulk runs) — update them to `failed` status
- Add a periodic check (every 2 minutes) during active bulk processing to catch jobs that went stale mid-session

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Reduce speaker-scan batches from 20 to 5 |
| `supabase/functions/run-lead-job/index.ts` | Add elapsed-time guard + timeout on synthesis call |
| `src/contexts/ProcessingContext.tsx` | Await DB persistence before acknowledging; periodic zombie cleanup |

## Why This Fixes It

- **Brady/Blake timeout**: Speaker fallback goes from ~140s to ~36s (both brands), keeping total under 400s
- **Lost meetings**: Jobs aren't acknowledged until meetings are confirmed in DB
- **Zombie jobs**: Cleaned up on mount and periodically, so they don't block future runs
- **Partial results preserved**: If edge function approaches timeout, it saves what it has rather than losing everything

