

# Fix: Past Dates Being Set as Next Follow-Up

## Root Cause

Two problems working together:

1. **The AI doesn't know today's date.** The `process-meeting` prompt says "'Next week' = calculate from meeting date if known" but never tells the AI what today is. So if a Feb 10 transcript says "let's follow up next week," the AI outputs `2024-02-17` — a date that was already past when processed.

2. **No date validation on auto-applied suggestions.** The `processSuggestedUpdates` function blindly applies any "Certain" `nextFollowUp` value, even if it's in the past. The existing `>= today` filter only applies to `intelligence.nextSteps[].deadline` (a separate path), not to `suggestedLeadUpdates.nextFollowUp`.

## Fix (3 files)

### 1. `supabase/functions/process-meeting/index.ts`
- Inject `TODAY'S DATE: YYYY-MM-DD` into the system prompt so the AI knows the current date.
- Update the `nextFollowUp` field description: "MUST be a future date. If the discussed date is in the past relative to today, calculate a reasonable future follow-up instead (e.g., 1 week from today)."

### 2. `src/components/MeetingsSection.tsx` — `processSuggestedUpdates`
- Add a guard: if `field === "nextFollowUp"` and the value is a date string before today, skip it (don't auto-apply, don't even queue it as "Likely").

### 3. `src/lib/bulkProcessing.ts` — `processSuggestedUpdates`
- Same guard as above for the bulk processing path.

This is a defense-in-depth approach: the AI should produce correct dates, but even if it doesn't, the client-side code will reject past dates for follow-up fields.

