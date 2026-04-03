

# Fix "Deal Not Found" + Redesign Action Summary on Pipeline Cards

## Problem 1: "Deal Not Found" on Click

The "3 actions overdue" link uses `window.location.href = /deal/${lead.id}?tab=actions` which causes a full page reload. On reload, DealRoom renders immediately while leads are still being fetched from the database — so `leads.find()` returns `undefined` and shows "Deal not found."

Two fixes needed:
- **Pipeline.tsx**: Replace `window.location.href` with React Router's `navigate()` (imported from `useNavigate`) so navigation happens client-side without losing state
- **DealRoom.tsx**: Add a loading guard — when `loading` is true and `lead` is not found, show a spinner instead of "Deal not found." Only show "Deal not found" when loading is complete and the lead genuinely doesn't exist

## Problem 2: Redesign Action Summary Row

Current: Red `text-destructive` text saying "3 actions overdue" with a raw date string. Looks alarming and cheap.

New design — clean, muted, professional:
- Replace red text with `text-muted-foreground` — no alarm colors on pipeline cards
- Format: `3 pending actions · Next follow-up Mar 24` (not "overdue" — reframe as "pending" to stay action-oriented rather than punitive)
- Add a subtle right arrow (`→`) on hover to indicate clickability
- Remove the word "overdue" entirely from the pipeline card — the Deal Room Actions tab handles urgency context
- For "do next" fallback line: keep as-is but ensure consistent muted styling

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Replace `window.location.href` with `navigate()` from React Router. Change action summary styling from `text-destructive` to `text-muted-foreground`, rename "overdue" to "pending actions", format date as `Mar 24` not `2026-03-24` |
| `src/pages/DealRoom.tsx` | Import `loading` from `useLeads()`. When `!lead && loading`, show a loading spinner. Only show "Deal not found" when `!lead && !loading` |

