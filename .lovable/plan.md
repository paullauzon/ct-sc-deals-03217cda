

# Fix: Hidden `_overdue` Filter Bug

## Root Cause
The "Overdue Follow-ups" quick-filter preset uses a hacky `_overdue: true` flag injected into the filters object. This flag:
- Persists in localStorage (so it survives page reloads)
- Is NOT detected by `hasActiveFilters` (no "Clear all" button appears)
- Is NOT used by `SummaryStats` (stats show all 171 deals, misleading)
- IS checked in `Pipeline.tsx`'s `matchesSearchAndFilters` — filtering cards down to only overdue leads

## Fix Plan

**File: `src/components/PipelineFilters.tsx`**
1. Add a proper `overdue: boolean` field to the `PipelineFilters` interface (and `EMPTY_FILTERS`)
2. Update `hasActiveFilters` to include `overdue`
3. Update `matchesFilters` to handle overdue filtering (check `nextFollowUp < today`)
4. Fix the "Overdue Follow-ups" preset button to use the proper field instead of the hack
5. Update `SummaryStats` filtered count to include overdue filtering

**File: `src/components/Pipeline.tsx`**
1. Remove the separate `_overdue` check from `matchesSearchAndFilters` — it's now handled by `matchesFilters`

This makes the overdue filter a first-class citizen: visible, clearable, and consistent across stats and cards.

