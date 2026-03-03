

# Investigation Results

## What's Working (Individual Auto-Find)
- **Backend persistence**: `startAutoFind` creates a DB job row, invokes `run-lead-job` edge function server-side. Processing continues even if you close the tab.
- **Hydration on return**: On mount, `ProcessingContext` queries for unacknowledged jobs and applies any completed results you missed.
- **Realtime updates**: Supabase realtime subscription streams job status changes live.
- **Inline suggestions**: Individual lead suggestions render inside the lead panel, not as popups.

## What's NOT Done (Two Gaps)

### Gap 1: Bulk Processing still runs client-side
`startBulkProcessing` calls `runBulkProcessing()` in `bulkProcessing.ts` — this runs entirely in-browser. If you close the tab during "Process All Leads," all progress is lost. The backend job queue was only built for individual auto-find.

**Fix**: Refactor bulk processing to create one `processing_jobs` row per lead (with `job_type: "bulk"`), invoke `run-lead-job` for each (with staggered delays), and track aggregate progress via realtime. The client becomes a viewer, not the processor.

### Gap 2: Bulk review suggestions still use popup dialogs
`GlobalProcessingOverlay.tsx` lines 62-111 show a `<Dialog>` modal for bulk suggestion review. The user asked for inline confirmations, not popups.

**Fix**: After bulk completes, populate `leadJobs` with pending suggestions (same as individual flow) so they appear inline inside each lead's panel. Remove the bulk review dialog.

## Plan

1. **Move bulk orchestration to backend** — Create a new edge function `run-bulk-job` that:
   - Fetches all transcripts from both Fireflies accounts
   - Matches to leads using the same matching logic
   - Creates individual `processing_jobs` rows per lead
   - Processes each sequentially with rate limiting
   - Client just inserts a master job row and watches via realtime

2. **Unify suggestion UX** — After bulk completes, merge pending suggestions into `leadJobs` state so they render inline inside each lead's detail panel (reusing the existing individual suggestion UI). Remove the bulk review `Dialog`.

3. **Update GlobalProcessingOverlay** — Keep only the floating progress bar for bulk (bottom-right), remove the review and done modals. Progress updates come from realtime polling of job statuses.

