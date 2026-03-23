

# Track Empty-Transcript Meetings as "No Recording" Entries

## Approach

Instead of completely filtering out meetings with no transcript, **keep them but tag them** so they're visible for no-show/recording-failure monitoring while still being excluded from AI processing.

## Plan

### 1. Store empty-transcript meetings with a `noRecording` flag
**File**: `supabase/functions/run-lead-job/index.ts`

Instead of discarding meetings with transcript < 50 chars, split them into two lists:
- **Real meetings** (transcript ≥ 50 chars) → proceed to AI processing as today
- **No-recording meetings** (transcript < 50 chars) → store with `noRecording: true`, empty summary set to "No recording available", skip AI processing

Both lists get saved to the final `new_meetings` array in the job result and written to the lead's `meetings` JSONB.

### 2. Add `noRecording` flag to Meeting type
**File**: `src/types/lead.ts`

Add optional `noRecording?: boolean` to the `Meeting` interface.

### 3. Display no-recording meetings in MeetingsSection with a visual indicator
**File**: `src/components/MeetingsSection.tsx`

Show these meetings in the meetings list with a distinct visual treatment:
- Gray/muted card with a "No Recording" badge
- Show date and title (so you can see the meeting was set)
- No transcript/summary/intelligence tabs — just a note like "Meeting scheduled but no recording captured"
- Exclude from meeting count used for intelligence synthesis

### 4. Exclude no-recording meetings from AI processing and intelligence synthesis
**File**: `supabase/functions/run-lead-job/index.ts`

When building `meetingsWithIntel` for deal intelligence synthesis, filter out `noRecording` meetings. The AI loop already skips them (transcript < 20 guard), but make it explicit.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/run-lead-job/index.ts` | Keep empty-transcript meetings tagged with `noRecording: true` instead of filtering them out |
| `src/types/lead.ts` | Add `noRecording?: boolean` to `Meeting` interface |
| `src/components/MeetingsSection.tsx` | Render no-recording meetings with muted styling and "No Recording" badge |

