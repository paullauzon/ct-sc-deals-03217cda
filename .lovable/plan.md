

# Bulk "Process All Leads" — Strategy & Plan

## The Challenge

170+ leads. For each lead, the auto-find flow:
1. Calls `fetch-fireflies` **twice** (CT + SC accounts) — each paginates up to 1000 transcripts
2. For each matched transcript, calls `process-meeting` (AI summarization + intelligence extraction)
3. Then calls `synthesize-deal-intelligence` across all meetings for that lead

That's potentially **340+ Fireflies API calls**, plus hundreds of AI calls. Key constraints:
- Fireflies API rate limits
- Edge function timeout (typically ~60s per invocation)
- AI gateway rate limits
- Browser memory (all data lives in localStorage/React state)

## Recommended Approach: Batch Processor with Queue + Progress UI

### How It Works

A new **"Process All Leads"** button on the Leads table header. When clicked:

1. **Pre-flight**: Fetches ALL transcripts from both CT and SC Fireflies accounts in one bulk pull (no per-lead search — just grab everything). This is ~2 API calls total instead of 340+.

2. **Client-side matching**: Match transcripts to leads using the same email/domain/name/company logic that `fetch-fireflies` already uses, but running entirely in the browser. No edge function needed for matching.

3. **Sequential processing queue**: For each lead that got matched transcripts, call `process-meeting` one at a time with a delay between calls. Show a progress bar: "Processing lead 14/178 — Tim Murray..."

4. **Auto-apply updates**: Same logic as today — "Certain" fields auto-apply, "Likely" fields queue up for batch review at the end.

5. **Deal intelligence synthesis**: After all meetings are processed for a lead, synthesize deal intelligence automatically.

6. **Batch review dialog**: At the end, show all "Likely" suggestions across all leads in one reviewable list.

### Why This Is Better Than 170 Individual Auto-Finds

| Approach | Fireflies API Calls | AI Calls | Time |
|----------|-------------------|----------|------|
| 170 individual auto-finds | ~340 (2 per lead) | N per transcript | Hours of clicking |
| Bulk fetch + client match | ~4-8 (paginated) | N per transcript | One click, ~15-30 min |

The bulk approach fetches transcripts ONCE, then matches locally. Massive reduction in API calls.

### Architecture

```text
[Process All Leads] button
        │
        ▼
  Bulk fetch ALL transcripts
  (CT + SC, paginated, metadata only)
        │
        ▼
  Client-side matching engine
  (email, domain, name, company → lead)
        │
        ▼
  For each lead with matches:
    │
    ├─ Fetch full transcripts (batched)
    ├─ Call process-meeting per transcript
    ├─ Auto-apply "Certain" updates
    ├─ Queue "Likely" for review
    └─ Synthesize deal intelligence
        │
        ▼
  Batch review dialog
  (all "Likely" suggestions at once)
```

## Files Changed

| File | Changes |
|------|---------|
| `src/components/LeadsTable.tsx` | Add "Process All Leads" button in header. Add `BulkProcessingDialog` component with progress bar, status log, cancel button, and batch review of "Likely" suggestions at the end. |
| `src/components/MeetingsSection.tsx` | Extract the matching logic and processing logic into exportable utility functions so both single-lead auto-find and bulk processing can reuse them. |
| `supabase/functions/fetch-fireflies/index.ts` | No changes needed — already supports fetching without search criteria (returns all recent transcripts). |

### Safeguards

- **Pause/Cancel**: User can stop the batch at any time; already-processed leads keep their updates.
- **Skip already-processed**: Leads that already have meetings with matching `firefliesId` are skipped.
- **Rate limiting**: 2-second delay between `process-meeting` calls to avoid gateway throttling.
- **Progress persistence**: Track which leads have been processed in case of interruption.
- **No data loss**: All updates go through the existing `updateLead` → localStorage pipeline.

