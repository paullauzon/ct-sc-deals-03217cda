

# Dashboard Layout Redesign

## Current Problems
- 9 equal-sized metric boxes create visual monotony -- no hierarchy tells you what matters most
- Sections like Forecast (all 0), ICP Fit (all 0), Meeting Outcomes (all 0) are pure noise when empty
- Service Interest shows only "TBD: 95" -- not actionable
- Everything has the same visual weight, nothing stands out
- Too many section headers and boxes create clutter, not clarity

## New Layout Structure

### Tier 1: Hero Metrics (top)
Three large, prominent cards spanning full width in a single row:
- **Total Leads** (the headline number)
- **Pipeline Value** (the money number)
- **Win Rate** (the performance number)

These get larger text (text-4xl) and more padding to establish visual hierarchy immediately.

### Tier 2: Pipeline Funnel (unchanged, it works well)
The horizontal bar chart stays -- it's the most useful visualization on the page. Clean, minimal, informative.

### Tier 3: Secondary Metrics (compact inline row)
Instead of 6 separate boxes for Meetings Set / Closed Won / Closed Lost / Went Dark / Avg Deal Value / Avg Days to Meeting, render them as a single horizontal strip with a light border -- label and value pairs separated by vertical dividers. One line, no wasted space.

### Tier 4: Breakdowns (side-by-side, conditional)
- **Lead Source** and **Service Interest** side-by-side (these always have data)
- **Forecast**, **ICP Fit**, **Meeting Outcomes** only shown when at least one item has a non-zero count. When all zeros, the section is hidden entirely -- no noise.

### Tier 5: Recent Leads (unchanged, it works well)
The recent leads list stays at the bottom.

## Technical Changes

**File: `src/components/Dashboard.tsx`** (full rewrite of the return JSX)

1. Hero metrics row: 3 cards with `text-4xl` values, `py-6 px-6` padding
2. Secondary metrics: single `flex` row with `divide-x` dividers, each item is `px-6 py-3` with label above value
3. Conditional rendering: wrap Forecast/ICP/Meeting sections in `{hasData && (...)}` checks
4. Remove redundant section headers where the data speaks for itself
5. Tighten spacing from `space-y-8` to `space-y-6` for density

No new files or dependencies needed. Single file change.
