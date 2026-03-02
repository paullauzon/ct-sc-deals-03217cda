

# Final Fixes and Polish Plan

## Verification Summary

After thorough end-to-end testing, the core system works correctly:
- Modal fields save instantly and sync across Table, Pipeline, and Dashboard
- Stage dropdown changes reflect in real-time across all views
- Pipeline drag-and-drop moves leads between columns
- Dynamic days-in-stage tracking is accurate (e.g. 102d for November leads)
- New Lead creation, CSV export, search, filters, and sortable columns all work
- Clearable dropdowns for optional fields (Forecast, ICP, Meeting Outcome) work
- Closed stages section shows at bottom of pipeline
- Dashboard shows pipeline funnel, forecast, service interest, source, ICP, meeting outcomes

## What Still Needs Fixing

### 1. Pipeline is overwhelmed -- 94 leads in "New Lead" column
All leads start in "New Lead" making the pipeline view a single massive column with 94 cards, defeating the purpose of a bird's-eye view. The pipeline needs a scrollable/collapsible column or max-height with scroll per column so you can actually see all stages without scrolling past 94 cards.

**Fix**: Add `max-h-[600px] overflow-y-auto` to each pipeline column's card container so each stage column scrolls independently, keeping all stages visible side-by-side.

### 2. Dashboard metrics grid has orphan row
9 metric cards in a 4-column grid creates rows of 4+4+1, leaving "Avg Days to Meeting" alone on the last row. Looks unfinished.

**Fix**: Restructure to 3x3 grid on desktop or combine some metrics to make even rows.

### 3. Deal Value input shows "0" instead of empty
When deal value is 0, the input shows "0" which looks like data was entered. Should show empty/placeholder when no value assigned.

**Fix**: Change `value={lead.dealValue || ""}` logic so 0 renders as empty with a placeholder.

### 4. Pipeline "New Lead" count shows 94 -- hard to distinguish column headers
With 94 cards, the "New Lead" column dominates. The count badge is tiny and easy to miss.

**Fix**: Make counts more prominent and add total pipeline value in the pipeline header area.

### 5. Closed stages in pipeline don't show deal values
The closed stages (Won/Lost/Dark) only show name and close reason but not deal value, which is critical for understanding revenue impact.

**Fix**: Add deal value to closed stage items.

---

## Technical Details

### Files to modify:

**`src/components/Pipeline.tsx`**
- Add `max-h-[600px] overflow-y-auto` to each stage column's card container
- Add deal value display to closed stage items
- Add total pipeline value summary in the header

**`src/components/Dashboard.tsx`**
- Restructure metrics grid from 4-col to cleaner layout (e.g., top 3 large cards for Total Leads / Pipeline Value / Win Rate, then 6 smaller ones in 3x2)

**`src/components/LeadsTable.tsx`**
- Fix deal value input to show empty when value is 0

### Implementation sequence:
1. Fix pipeline column scrolling (most impactful -- makes pipeline actually usable)
2. Add deal values to closed stage cards
3. Restructure dashboard metrics layout
4. Fix deal value "0" display issue

