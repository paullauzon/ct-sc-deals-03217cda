
## What I found

The stuck “Searching for Amber Tobias...” state is most likely a frontend state bug, not proof that work is still running.

Current flow in `src/contexts/ProcessingContext.tsx`:
1. `startAutoFind()` immediately sets `leadJobs[lead.id].searching = true`
2. The UI renders that generic message in `src/components/GlobalProcessingOverlay.tsx`
3. If the job goes stale, `markJobAsTimedOut()` updates the DB to:
   - `status = failed`
   - `acknowledged = true`
4. But the realtime listener ignores any update where `acknowledged` is true:
   - `if (job.acknowledged) return;`
5. Result: the failure never clears the local `leadJobs` state, so the spinner can stay forever

There is also no live per-lead progress text for individual searches, only the static “Searching for X...” label, so even when the backend is doing work you can’t tell what step it is on.

I also found a timeout mismatch:
- stale-job logic uses 15 minutes
- `waitForJobCompletion()` still times out after 10 minutes

## Plan

### 1. Fix the stale-job cleanup bug
Update `src/contexts/ProcessingContext.tsx` so timed-out jobs are not hidden from the realtime handler before the UI can react.

Implementation:
- Change `markJobAsTimedOut()` to stop setting `acknowledged: true` immediately
- Let the normal `failed` branch process the update, clear `leadJobs`, show an error, then acknowledge
- Reorder the realtime handler so terminal statuses (`completed` / `failed`) are handled before the early `acknowledged` return

### 2. Show real progress for individual lead searches
Right now individual jobs only show a spinner with a name.

Implementation:
- Extend `LeadJobState` with `progressMessage` and optionally `status`
- In the realtime subscription and hydration path, copy `job.progress_message` into `leadJobs[job.lead_id]`
- Render that message in `src/components/GlobalProcessingOverlay.tsx` so the user sees:
  - Searching Fireflies (Captarget)...
  - Searching Fireflies (SourceCo)...
  - Found N meetings, analyzing with AI...
  - Synthesizing deal intelligence...

### 3. Make timeout behavior consistent
Use one shared timeout constant in `src/contexts/ProcessingContext.tsx`.

Implementation:
- Replace the hardcoded 10-minute timeout in `waitForJobCompletion()` with the same 15-minute threshold used by stale cleanup
- Use the same constant for:
  - `isStaleJob()`
  - periodic cleanup
  - wait-for-completion safety timeout

### 4. Clear stuck UI state immediately when a job times out
Even with realtime fixes, the UI should defensively clear stale entries.

Implementation:
- When stale jobs are detected during hydration or periodic cleanup, also remove their entry from `leadJobs`
- Show a toast like “Search timed out for Amber Tobias”
- Prevent the overlay from showing a spinner for jobs already marked failed locally

### 5. Rehydrate visible state after refresh
If the page refreshes during a search, the user should still see what is happening.

Implementation:
- During mount hydration, rebuild `leadJobs` from unacknowledged `queued` / `processing` jobs including `progress_message`
- If there are no active jobs but the UI still has a stale local searching state, clear it

## Files to update

- `src/contexts/ProcessingContext.tsx`
  - fix stale timeout acknowledgment flow
  - store per-lead progress messages
  - unify timeout constants
  - improve hydration / cleanup behavior
- `src/components/GlobalProcessingOverlay.tsx`
  - show live per-lead progress text instead of only “Searching for X...”
  - optionally show timed-out / failed state more clearly

## Technical details

The most important bug is this combination:

```ts
markJobAsTimedOut() => update({ status: "failed", acknowledged: true })
```

plus

```ts
if (job.acknowledged) return;
```

That means the UI never processes the failed update, so the search indicator can remain on screen indefinitely even though the job is already dead.

After this fix, you’ll be able to tell the difference between:
- still running
- timed out
- failed
- finished
