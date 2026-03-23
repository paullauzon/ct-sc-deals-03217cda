

# Phase 3 Fix + Phase 4 & 5 Implementation

## Phase 3 Fix

One minor issue: Block 6 (Target Revenue Correlation, lines 479-486 in DashboardPersonaMetrics) has a vestigial "Header" row at the bottom that serves no purpose. Remove it.

## Phase 4: Time-Series & Trend Analytics

Add a new section to the **Overview tab** between the Pipeline Snapshots row and the Forecast/Deal Health row. Uses `pipeline_snapshots` table data (already fetched by PipelineSnapshots component) plus computed lead-level date analysis.

### New component: `src/components/DashboardTrends.tsx`

Accepts `leads: Lead[]` and renders 4 compact trend blocks in a 2x2 grid:

**Block 1: Win Rate Over Time** — Group leads by month of `closedDate`. For each month with closed deals, compute win rate. Show as a simple line/sparkline with the current month highlighted. Answers: "Are we getting better at closing?"

**Block 2: Sales Cycle Trend** — Group won deals by month of `closedDate`. Compute avg days from `dateSubmitted` to `closedDate` per month. Show as line. Answers: "Are deals closing faster or slower?"

**Block 3: Pipeline Value Trend** — Use `pipeline_snapshots` data (already queried in PipelineSnapshots component). Extract `weighted_pipeline_value` per snapshot. Show as area chart. Answers: "Are we growing or depleting pipeline?"

**Block 4: Cohort Analysis** — Group leads by quarter of `dateSubmitted` (Q1/Q2/Q3/Q4). For each cohort show: count, meeting rate, win rate, avg deal value. Table format. Answers: "Which intake period produces best results?"

### Integration in `Dashboard.tsx`
- Import and render `<DashboardTrends>` inside the Overview tab after the Stage Conversion Funnel
- For Pipeline Value Trend, pass snapshot data from PipelineSnapshots (need to lift the query or duplicate it — simplest: query `pipeline_snapshots` directly in the new component)

## Phase 5: Competitive & Loss Pattern Intelligence

Add a new section to the **Pipeline tab** after the Forecast Summary. Contains 4 analytical blocks.

### New component: `src/components/DashboardLossIntelligence.tsx`

Accepts `leads: Lead[]` and `onDrillDown` callback.

**Block 1: Loss Pattern Analysis** — For all Closed Lost + Went Dark leads, group by `stage` at time of loss (use `closeReason` distribution per buyer type). Show which stages deals die at most, with a breakdown bar. Cross-reference with `buyerType` to show which buyer segments have highest attrition at each stage.

**Block 2: Time-to-Dark Analysis** — For Went Dark leads, compute days from `dateSubmitted` to `closedDate` (or `stageEnteredDate` if no closedDate). Show distribution buckets (0-14d, 15-30d, 31-60d, 60d+). Correlate with last activity type (had meeting vs no meeting). Answers: "How fast do we lose them and does engagement help?"

**Block 3: Objection Frequency Map** — Aggregate `objectionTracker` from `dealIntelligence` across all leads. Count each unique objection text (normalized), group by status (Open/Addressed/Recurring). Show top 10 with their resolution rates. Cross-reference with outcomes (did addressing the objection lead to a win?). Also aggregate `closeReason` for Closed Lost leads.

**Block 4: Re-engagement Opportunities** — Filter Went Dark leads that have: ICP fit Strong/Moderate, tier 1-2, deal value > median, and went dark < 90 days ago. These are high-value leads worth re-engaging. Show as clickable list with drill-down.

### Integration in `Dashboard.tsx`
- Import and render `<DashboardLossIntelligence>` in the Pipeline tab after Forecast Summary

## Files Changed

| File | Change |
|------|--------|
| `src/components/DashboardPersonaMetrics.tsx` | Remove vestigial header row (lines 479-486) |
| `src/components/DashboardTrends.tsx` | **New** — 4 time-series trend blocks for Overview tab |
| `src/components/DashboardLossIntelligence.tsx` | **New** — 4 loss/competitive intelligence blocks for Pipeline tab |
| `src/components/Dashboard.tsx` | Import and render both new components in their respective tabs |

