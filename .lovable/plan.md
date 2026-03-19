

# Remove All Transcript Truncation — Full Meeting Intelligence

## Problem
Transcripts are truncated at 6 different points across the codebase, degrading AI analysis quality. The user wants full transcripts analyzed every time.

## Truncation Points to Remove

| Location | Current Limit | Purpose |
|---|---|---|
| `process-meeting/index.ts:292` | 25,000 chars | Main AI analysis of each meeting |
| `run-lead-job/index.ts:76` | 15,000 chars | Prefetched meetings before AI |
| `run-lead-job/index.ts:309` | 3,000 chars | Meetings passed to synthesize-deal-intelligence |
| `synthesize-deal-intelligence/index.ts:75` | 3,000 chars | Transcript excerpt for psychological analysis |
| `ProcessingContext.tsx:379` | 3,000 chars | Existing meetings passed to bulk run-lead-job |
| `ProcessingContext.tsx:525` | 3,000 chars | Existing meetings passed to individual run-lead-job |
| `bulkProcessing.ts:238` | 3,000 chars | Meetings passed to synthesize-deal-intelligence |
| `fetch-fireflies/index.ts:523` | 15,000 chars | Summarization during Fireflies fetch |

## Fix Plan

### 1. `process-meeting/index.ts` — Remove 25K truncation
Send the full transcript to GPT-4o. The model supports 128K tokens (~400K chars), so even 50K-char transcripts fit easily.

### 2. `run-lead-job/index.ts` — Remove 15K and 3K truncations
- Line 76: Stop truncating prefetched meeting transcripts
- Line 309: Send full transcripts to synthesize-deal-intelligence (but keep a reasonable cap of ~10K per meeting for synthesis since it receives ALL meetings at once — synthesis needs the intelligence fields more than raw transcript)

### 3. `synthesize-deal-intelligence/index.ts` — Increase transcript excerpt
- Line 75: Increase from 3K to full transcript. Since this function receives all meetings, cap each at 15K to stay within context limits for leads with many meetings.

### 4. `ProcessingContext.tsx` — Remove 3K truncation on existing meetings
- Lines 379 and 525: Pass existing meetings with full transcripts to run-lead-job. These are used for "prior meeting context" during AI analysis.

### 5. `bulkProcessing.ts` — Remove 3K truncation
- Line 238: Pass full transcripts to synthesize-deal-intelligence.

### 6. `fetch-fireflies/index.ts` — Remove 15K truncation for summarization
- Line 523: Send full transcript to the summarization call.

### Safety: Context Window Management
Rather than hard-truncating, use a smart approach:
- **`process-meeting`**: Full transcript (single meeting, GPT-4o 128K context is sufficient)
- **`synthesize-deal-intelligence`**: Full transcript per meeting, but if total payload exceeds 100K chars, trim the oldest meetings' transcripts proportionally
- **`fetch-fireflies` summarization**: Full transcript

### Files Changed
- `supabase/functions/process-meeting/index.ts` — remove 25K truncation
- `supabase/functions/run-lead-job/index.ts` — remove 15K and 3K truncations
- `supabase/functions/synthesize-deal-intelligence/index.ts` — send full transcripts with smart total cap
- `supabase/functions/fetch-fireflies/index.ts` — remove 15K truncation
- `src/contexts/ProcessingContext.tsx` — remove 3K truncations (2 places)
- `src/lib/bulkProcessing.ts` — remove 3K truncation

