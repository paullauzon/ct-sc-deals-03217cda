

# Diagnosis: Meeting Showing Across All Leads

## What Happened

The bug was caused by the `.push()` mutation in `MeetingsSection.tsx` that was already fixed in the previous update. Here's what went wrong:

1. When auto-find ran for Barry Andrews, the old code did `meetings.push(newMeeting)` — this mutated `lead.meetings` directly
2. Because React state objects share references after `JSON.parse` → spread operations, this mutation could bleed into the shared state before `updateLead` created proper copies
3. When `localStorage` was written, the corrupted state (with the meeting on the wrong leads) was persisted

## Current State

- The `.push()` mutation fix is **already deployed** in the current code — it now uses `[...meetings, ...addedMeetings]` (immutable)
- However, the user's **localStorage still contains the corrupted data** from before the fix

## Plan

### 1. Clear corrupted meeting data (LeadContext.tsx)
Add a one-time migration (bump `SCHEMA_VERSION` to 8) that cleans up leaked meetings:
- For each lead, filter out meetings whose `firefliesId` doesn't match the lead's email/name in the attendee data
- OR simpler: just reset all meetings and let users re-import (since there's only 1 meeting imported so far)

Actually, the cleanest approach: bump `SCHEMA_VERSION` from 7 to 8, which will force a full re-initialization from the hardcoded data (wiping localStorage). The user will lose the 1 imported meeting but can re-import it cleanly with the fixed code.

### 2. No other code changes needed
The immutable array fix is already in place. The auto-find correctly targets only the specific lead by ID.

### Files Changed
| File | Change |
|------|--------|
| `src/contexts/LeadContext.tsx` | Bump `SCHEMA_VERSION` from 7 to 8 to force clean state |

### Alternative (if user wants to keep existing data)
Instead of full reset, add a migration step that deduplicates meetings: for each lead, only keep meetings where the lead's email appears in the Fireflies attendee list, or where the meeting was explicitly assigned to that lead. This is more complex but preserves any manual edits.

