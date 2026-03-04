

# "New until clicked" — read/unread tracking for leads

## Current behavior
The `isNewLead()` function marks leads as "NEW" based on stage ("New Lead") + time (< 24 hours). The user wants leads to stay marked as new **until they click on them** (open the detail panel), regardless of time or stage.

## Approach
Track a set of **"seen" lead IDs** in `localStorage` so it persists across refreshes. Any lead whose ID is NOT in the seen set gets a "NEW" badge. Clicking a lead (opening detail) adds it to the seen set.

### Changes

1. **`src/contexts/LeadContext.tsx`**
   - Add `seenLeadIds: Set<string>` state, initialized from `localStorage`
   - Add `markLeadSeen(id: string)` — adds ID to the set + persists to `localStorage`
   - Add `isLeadNew(id: string): boolean` — returns `true` if NOT in seen set
   - On initial load, mark all existing leads as seen (so only future arrivals show as new)
   - On realtime `INSERT`, do NOT add to seen set (so it shows as new)
   - Update `unseenCount` to derive from leads not in `seenLeadIds`

2. **`src/components/LeadsTable.tsx`**
   - When opening the detail sheet (`LeadDetail`), call `markLeadSeen(leadId)`
   - Use `isLeadNew(lead.id)` instead of `isNewLead(lead)` for the "NEW" badge

3. **`src/components/Pipeline.tsx`**
   - When clicking a card (opening detail), call `markLeadSeen(leadId)`
   - Use `isLeadNew(lead.id)` instead of `isNewLead(lead)` for the "NEW" badge

4. **`src/lib/newLeadUtils.ts`** — can be removed or kept as fallback; no longer primary logic

No database changes needed — this is purely client-side state stored in `localStorage`.

