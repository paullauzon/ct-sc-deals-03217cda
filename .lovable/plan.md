

# Merge All Pipeline Stages Into One Scrollable Row

## Problem
Currently the pipeline has two separate sections: 8 active stages in a horizontal scrollable row, and 3 closed stages in a separate grid below with a "Closed" header. The user wants all 11 stages in a single continuous horizontal row for a true end-to-end timeline view.

## Changes

### File: `src/components/Pipeline.tsx`

1. **Merge `PIPELINE_STAGES` and `CLOSED_STAGES` into one array** -- remove the separate `CLOSED_STAGES` constant and combine all 11 stages into `PIPELINE_STAGES`.

2. **Remove the separate "Closed" section** (lines 112-153) -- delete the entire grid layout for closed stages.

3. **Render all 11 stages in the single `flex gap-4 overflow-x-auto` row** -- closed stages get the same card-column treatment as active stages (header with count, value, scrollable deal cards). This gives a true left-to-right timeline.

4. **Add `scroll-smooth`** to the scrollable container for smooth horizontal scrolling.

5. **Visual distinction for closed stages** -- add a subtle left border or slight background tint (`bg-muted/30`) to the 3 closed columns so they're visually distinguishable as terminal stages without breaking the single-row flow.

6. **Ensure closed stage cards show close reason** -- the deal cards in closed columns will show `closeReason` inline (already shown in the current closed section, just needs to carry over to the unified card template).

No other files need changes. Data saving, drag-and-drop, and lead detail modal remain untouched.

