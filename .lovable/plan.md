

# Response 2: Deal Velocity Timeline + Monthly Trend Sparklines

## What Gets Built

### 1. Deal Velocity Timeline (Operations tab)
Average days between each sequential stage transition, per brand. Uses `lead_activity_log` stage_change events to compute real transition times. Falls back to computing from `dateSubmitted` → `closedDate` spread across stages when activity log data is sparse.

Layout: A table with rows for each transition (New Lead → Qualified, Qualified → Contacted, etc.) and columns for CT avg days, CT count, SC avg days, SC count. Cells color-coded: green (<7d), yellow (7-14d), orange (14-21d), red (21d+). Placed below Pipeline Momentum, above Rep Capacity.

Data source: Query `lead_activity_log` where `event_type = 'stage_change'`, parse old_value/new_value to extract "from → to" transitions with timestamps. Group by brand (join back to leads table by lead_id).

### 2. Monthly Trend Sparklines (Overview tab scorecards)
Add tiny inline sparklines (last 4 months) to each metric in the Brand Scorecards. For each brand, compute monthly snapshots of: Total Leads (by dateSubmitted month), Pipeline Value, MRR (by closedDate month), Win Rate (by closedDate month).

Each sparkline is a simple 4-dot SVG line rendered inline next to the metric value. Uses the leads array grouped by month — no new DB queries needed.

Implementation: Create a small `Sparkline` component (inline SVG, ~20 lines) that takes an array of numbers and renders a mini line chart. Modify `BrandScorecard` to compute per-month metrics and pass them to sparklines.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardOperations.tsx` | Add Deal Velocity Timeline section: fetch activity log stage_change events, compute avg days per transition per brand, render as color-coded table |
| `src/components/DashboardBusiness.tsx` | Add `Sparkline` SVG component. Modify `BrandScorecard` to compute last-4-month values for each metric and render sparklines inline |

