

# Fix False Meeting Matches + Add Meeting Removal

## Root Cause of False Matches

The matching logic in `fetch-fireflies/index.ts` (lines 168-188) splits the lead name into individual parts and matches **any single part** with length >= 3 against the meeting title, participants, and emails. 

For "Michael Brady":
- Name parts: `["michael", "brady"]`
- Any meeting with "michael" in the title or participants matches — even if it's a completely different Michael.

This is fundamentally too loose. A first name alone should never be enough to match.

## Fix

### 1. Tighten matching logic (`supabase/functions/fetch-fireflies/index.ts`)

Replace the individual name-part matching with **full name matching**:
- Match the **full name** (lowercased) against title and participant fields
- Also match **email domain + last name** combo as a secondary signal
- Remove the `part.length >= 3` individual-word matching entirely
- Keep email matching as-is (emails are unique enough)

Specifically:
- Instead of splitting into parts and matching any single part, require **both first and last name** to appear in the same field (title or participant string)
- For single-word names, require exact word boundary matching

### 2. Add meeting removal (`src/components/MeetingsSection.tsx`)

- Add a delete button (small X or trash icon) on each `MeetingCard`
- On click, confirm with the user, then call `updateLead` with the meeting filtered out
- Pass `onRemove` callback from `MeetingsSection` to `MeetingCard`

| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Require full name match instead of individual name parts |
| `src/components/MeetingsSection.tsx` | Add remove button on each meeting card |

