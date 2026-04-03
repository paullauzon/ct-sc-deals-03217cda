

# Redesign Pipeline Card Actions: Clean, Clickable, Professional

## What's Wrong Now

1. **Overdue actions section** uses random emoji (⚠), mismatched icon styles (AlertTriangle + Crown), tiny checkbox circles, and red text that clashes with the minimalist design system
2. **Win/Lose "do next" line** at the bottom uses a Crown icon that has no semantic meaning — looks decorative, not actionable
3. **No clear path to action** — clicking a checkbox on a 9px pipeline card is not how a sales rep works. They need one click to get to the Deal Room Actions tab where AI drafting is available
4. **Follow-up date** sits below everything as an orphaned line

## What Gets Built

### Pipeline Card — Simplified Action Summary

Replace the current overdue collapsible + crown tooltip + follow-up line with a single clean block:

**When overdue actions exist:**
- One line: `3 actions overdue` in subdued red text (no emoji, no icons, no triangle)
- Entire line is clickable → navigates to `/deal/:id` with Actions tab focused
- On hover: subtle underline + arrow indicator

**When no overdue but "do next" exists:**
- One line: the `doNext` text from win/lose card, plain muted text
- Clickable → navigates to Deal Room Actions tab

**Follow-up date** moves inline as a small muted suffix: `· Follow-up Mar 24`

Remove: Crown icon, AlertTriangle icon, ⚠ emoji, inline checkboxes on cards, CollapsibleContent with individual items. All of that lives in Deal Room.

### Deal Room Actions Tab — Add "Draft" Buttons

Each open action item row gets a "Draft" button that triggers the existing `draft-followup` edge function with the action item context pre-filled. This reuses the same AI drafting pattern from FollowUpsTab.

Flow: Click "Draft" → calls edge function with meeting context + action item text → shows generated email in a textarea → "Copy" button.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Replace overdue collapsible + crown tooltip + follow-up line with clean single-line clickable summary that links to Deal Room |
| `src/pages/DealRoom.tsx` | Add "Draft" button to each open action item row, with inline AI email generation using existing `draft-followup` edge function |

