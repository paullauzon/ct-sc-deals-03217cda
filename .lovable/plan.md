

# Background Processing with Deferred Review Modals

## Problem

Both processing flows (bulk "Process All Leads" and individual "Auto-find transcripts") use **component-local state**. This means:

1. **Bulk dialog**: User must keep the dialog open the entire time (15-30 min). If they close it mid-run, results and the review modal are lost. The dialog also blocks `onOpenChange` during "running" phase, trapping the user.
2. **Individual auto-find**: Suggestions state lives inside `MeetingsSection`, which is inside a lead detail panel. If the user clicks a different lead or switches views, the pending suggestions vanish without being shown.

Both flows need to run in the background and surface their review modals reliably when complete.

## Approach

Create a **global processing context** that lives at the app root (alongside `LeadProvider`), managing all background processing state. A **global review modal** renders at the top level so it's never unmounted by navigation.

### New file: `src/contexts/ProcessingContext.tsx`

- Holds state for:
  - `bulkJob`: progress, results, phase (idle/running/review/done)
  - `leadJobs`: a map of lead-id to individual auto-find jobs (searching, pendingSuggestions)
- Exposes functions: `startBulkProcessing()`, `startAutoFind(lead)`, `cancelBulk()`
- Processing runs via `async` functions that update context state — the actual API calls and `updateLead` logic move here from `BulkProcessingDialog` and `MeetingsSection.handleAutoFind`
- When a job finishes and has pending suggestions, it sets a flag that triggers the review modal
- A toast notification announces completion with a "Review" action button as a fallback

### New file: `src/components/GlobalProcessingOverlay.tsx`

- Renders at root level inside `Index.tsx` (always mounted)
- Shows a **small persistent progress indicator** (bottom-right corner, like a download bar) when any job is running — not a blocking dialog
- When a job finishes with pending suggestions, auto-opens the review dialog (reusing existing review UI from `BulkProcessingDialog`)
- For individual lead auto-find completions, shows a simpler suggestion review modal

### Changes to existing files

**`src/components/BulkProcessingDialog.tsx`**
- Simplify to a thin "Start" confirmation dialog only (the idle phase)
- On "Start", calls `startBulkProcessing()` from context and closes itself
- All running/review/done phases move to `GlobalProcessingOverlay`

**`src/components/MeetingsSection.tsx`**
- `handleAutoFind` calls `startAutoFind(lead)` from context instead of running inline
- Remove local `searching`, `pendingSuggestions`, `showSuggestionsDialog` state
- Still shows a spinner via context's `leadJobs[lead.id].searching` flag

**`src/pages/Index.tsx`**
- Wrap content with `ProcessingProvider`
- Add `<GlobalProcessingOverlay />` inside the provider

**`src/contexts/LeadContext.tsx`**
- No changes needed — `updateLead` is already available via context

### UX Flow After Fix

1. User clicks "Process All Leads" → confirmation dialog → clicks Start → dialog closes → small progress bar appears in corner
2. User navigates freely between Dashboard, Leads, Pipeline
3. Processing finishes → toast "Bulk processing complete — X suggestions to review" → review modal auto-opens
4. Same pattern for individual lead auto-find: click button → lead detail stays usable → toast + modal when done

## Technical Details

- Processing logic (API calls, matching, sequential await) stays identical — just relocated from component state to context
- Cancel ref pattern preserved for bulk cancellation
- `useRef` for cancel flags works the same in context as in components
- Results stored in context state survive navigation between views
- Review modal uses the same accept/dismiss/accept-all UI already built

