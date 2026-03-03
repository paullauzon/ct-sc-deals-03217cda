

# Fix: Strictly Sequential Bulk Processing with Detailed Progress

## Problem
Current bulk processing creates all jobs upfront and invokes 2 at a time. This still causes Fireflies rate limiting and edge function overload. The progress indicator is vague — just shows "X/Y leads processed."

## Solution: True One-at-a-Time Processing

Process exactly **one lead at a time**: search → find meetings → AI process → save → move to next. The overlay shows exactly what's happening at each step.

### Changes

**`src/contexts/ProcessingContext.tsx`**

1. **Add `currentLeadName` to `BulkJobState`** to track which lead is actively being processed
2. **Rewrite `startBulkProcessing`** to be strictly sequential:
   - Create ONE job at a time (not all upfront)
   - `await` the edge function invocation fully before moving to next
   - Wait for the realtime "completed" or "failed" signal before proceeding
   - Update `progressMessage` with detailed step info: `"[3/168] Searching for John Smith..."` → `"[3/168] Found 2 meetings for John Smith, processing..."` → `"[3/168] John Smith done. Moving to next..."`
3. **Remove concurrency**: `CONCURRENCY = 2` → strictly sequential loop
4. **Add a promise-based "wait for job completion"**: after invoking `run-lead-job`, subscribe to that specific job's status changes and resolve when it hits `completed` or `failed`

**`src/components/GlobalProcessingOverlay.tsx`**

Redesign the overlay to show:
- Current lead name and what's happening: `"Searching for John Smith..."`
- Counter: `"Lead 3 of 168"`
- Progress bar
- Results so far: `"Found: 12 · No meetings: 5 · Failed: 1"`
- Cancel button

**`supabase/functions/run-lead-job/index.ts`**

- Increase delay between Fireflies brand calls from 2s to 3s for safety
- Add more granular `progress_message` updates that the client can display:
  - `"Searching Fireflies (Captarget)..."`
  - `"Searching Fireflies (SourceCo)..."`  
  - `"Found 3 meetings, analyzing with AI..."`
  - `"AI analyzing meeting 1/3: 'Q4 Review Call'..."`
  - `"Synthesizing deal intelligence..."`

### Flow

```text
for each lead (1 at a time):
  1. Insert processing_job row (status: queued)
  2. Invoke run-lead-job edge function
  3. Edge function updates progress_message at each step
  4. Client shows progress_message in overlay via realtime
  5. Wait for status = completed | failed
  6. Apply results, update counter
  7. Small delay (1s), then next lead
```

### Files to Change
| File | What |
|------|------|
| `src/contexts/ProcessingContext.tsx` | Sequential loop, wait-for-completion, detailed progress state |
| `src/components/GlobalProcessingOverlay.tsx` | Rich progress display with current lead, step detail, stats |
| `supabase/functions/run-lead-job/index.ts` | More granular progress_message updates, increased delays |

