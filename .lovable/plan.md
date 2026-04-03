

# Redesign Action Items: Collapsible on Pipeline Cards + Actionable Hub in Deal Room

## The Problems

1. **Pipeline cards**: Dropped promises show as truncated text with "+2 more" that can't be expanded. No way to see or act on them.
2. **Deal Room sidebar**: Action items are listed but are read-only — no way to mark them done, draft a follow-up, or take action directly.
3. **No connection** between seeing a dropped promise and doing something about it (drafting an email, marking complete, etc.).

## What Gets Built

### 1. Pipeline Card — Collapsible Action Items

Replace the current single-line truncated display with a collapsible:
- **Collapsed** (default): Show count badge "⚠ 3 overdue actions" with a chevron toggle
- **Expanded**: Show each action item as a compact row with: item text, days overdue, owner, and a small "✓" button to mark done inline
- Uses `Collapsible` from radix (already in project)
- Clicking the item text still opens the lead detail as before

### 2. Deal Room — "Action Center" Tab

Add a new tab "Actions" to the Deal Room tabbed workspace (between Intelligence and Emails). This becomes the single place to see and act on everything:

- **Open Action Items** section: Each item shows text, owner, deadline, days overdue, status badge. Each row has:
  - "✓ Done" button — marks the action item as completed in the lead's `dealIntelligence.actionItemTracker`
  - "Draft Follow-Up" button — opens the existing ActionSheet (from FollowUpsTab) pre-filled with context about this specific action item
- **Next Best Action** card at the top — computed from `getNextBestAction()` in `dealHealthUtils.ts`, showing the single most important thing to do with urgency color coding
- **Completed Items** collapsible at bottom — shows what's been done for audit trail

### 3. Pipeline Lead Detail Panel — Action Items Section

The `LeadDetail` component (in LeadsTable.tsx) is the side panel that opens when clicking a pipeline card. Add a compact "Action Items" section here too:
- Show open items with "✓" mark-done buttons
- Link to "Open Deal Room → Actions" for the full view

## Technical Approach

- **Marking items done**: Update `lead.dealIntelligence.actionItemTracker[i].status` from "Open"/"Overdue" to "Completed" and persist via `updateLead()`. No new database tables needed.
- **`getNextBestAction`**: Already built in `dealHealthUtils.ts` but never imported anywhere. Wire it into the Deal Room Actions tab and Pipeline card.
- **ActionSheet reuse**: Extract the ActionSheet component from FollowUpsTab into its own file so it can be imported by Deal Room. Or keep it inline and add a similar draft capability in Deal Room.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Replace dropped promises single-line with Collapsible showing all items with mark-done buttons |
| `src/pages/DealRoom.tsx` | Add "Actions" tab with Next Best Action card, actionable item list with Done/Draft buttons, completed items collapsible |
| `src/lib/dealHealthUtils.ts` | Add helper to update action item status in-place (returns updated dealIntelligence object) |

