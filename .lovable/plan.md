
# Implementation Complete

## Architecture

### Individual Auto-Find
- Client creates `processing_jobs` row → invokes `run-lead-job` edge function
- Edge function runs server-side: fetches Fireflies, AI processing, writes results to DB
- Client receives results via Supabase Realtime subscription
- Survives tab close ✓

### Bulk Processing (NEW — backend-powered)
- Client fetches all transcripts from both Fireflies accounts (via `fetch-fireflies` edge function)
- Client matches transcripts to leads locally
- For each matched lead: creates `processing_jobs` row (job_type: "bulk") and invokes `run-lead-job` with prefetched meetings
- Each `run-lead-job` runs independently server-side — survives tab close ✓
- On tab re-open: hydration finds queued/processing bulk jobs, re-invokes queued ones
- Progress tracked via Realtime: completedJobs/totalJobs counter

### Unified Suggestion UX
- All suggestions (individual + bulk) render inline inside lead detail panels
- No popup dialogs for bulk review — removed `Dialog` modals from GlobalProcessingOverlay
- GlobalProcessingOverlay shows only a floating progress bar (bottom-right)

### `run-lead-job` Enhancement
- Accepts optional `prefetchedMeetings` param
- If provided, skips Fireflies fetch and uses pre-matched meetings directly
- Used by bulk processing to avoid redundant per-lead Fireflies API calls
