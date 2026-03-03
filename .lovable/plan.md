
# Fix: Meetings Not Found Due to Early Limit

## Root Cause

In `fetch-fireflies/index.ts`, the flow is:
1. Fetch all transcripts from Fireflies API
2. **Slice to `limit` (line 69)** ← cuts results too early
3. Filter by name/email (line 175)

If Barry Andrews has 2 meetings but they're not both in the first 20 transcripts returned, the 2nd one gets discarded before the name filter can find it.

## Fix

**`supabase/functions/fetch-fireflies/index.ts`**: Move `transcripts.slice(0, limit)` from line 69 (before search filter) to after the search filter block (~line 192). This ensures all transcripts are searched first, then the result set is trimmed.

Also increase the auto-find limit in **`src/components/MeetingsSection.tsx`** from `limit: 20` to `limit: 50` to be safe.

| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Move `.slice(0, limit)` to after the search filter block |
| `src/components/MeetingsSection.tsx` | Change `limit: 20` to `limit: 50` in auto-find call |
