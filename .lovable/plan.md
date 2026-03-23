

# Phase 1: Dashboard Restructure — Tab-Based Information Architecture

## The Problem

The current dashboard is a **vertical scroll of 20+ metric blocks** with no narrative hierarchy. Metrics repeat across sections (win rate appears 3 times, source data in 4 places, owner workload duplicated). Critical insights are buried in collapsibles. A C-suite exec scanning for 30 seconds sees the same wall as a sales ops person doing deep analysis.

## The Solution: Tabbed Dashboard with Audience-Driven Sections

Replace the single scrolling page with **4 tabs**, each answering a different strategic question:

```text
┌────────────────────────────────────────────────────────┐
│ Dashboard    148 leads · Pipeline health & intelligence │
│                                                        │
│ ┌──────────┬──────────┬──────────┬───────────┐         │
│ │ OVERVIEW │ PIPELINE │  TEAM    │  BUYERS   │         │
│ └──────────┴──────────┴──────────┴───────────┘         │
│                                                        │
│  (tab content below)                                   │
└────────────────────────────────────────────────────────┘
```

### Tab 1: OVERVIEW (C-Suite / Default View)
**Question: "How's the business doing?"**

Everything a CEO needs in one screen, no scrolling:

- **Row 1 — 4 Hero KPIs**: Total Leads, Pipeline Value (weighted), MRR/ARR, Win Rate
- **Row 2 — 4 Trend Indicators**: This Week volume, MoM Growth, Sales Velocity $/day, Coverage Ratio
- **Row 3 — 3 blocks side by side**:
  - Pipeline Trend sparkline (from snapshots)
  - Forecast vs Target (commit/best case/gap bar)
  - Deal Health summary (critical/warning/healthy + at-risk revenue)
- **Row 4 — Stage Conversion Funnel** (compact horizontal bars with weakest-link highlight)

Moves Intelligence Coverage, Deal Momentum, LVR into the trend indicators row. Consolidates 3 current sections into 1 tight view.

### Tab 2: PIPELINE (Sales Ops)
**Question: "Where are deals and what needs attention?"**

- **Row 1 — Sales Velocity + Weighted Pipeline** (the 2 hero cards from current AdvancedMetrics)
- **Row 2 — Pipeline Funnel** (full visual, currently hidden in collapsible) + **Revenue at Risk** (with clickable at-risk leads)
- **Row 3 — Stale Leads** (currently hidden) + **Forecast Summary** (Commit/Best Case/Pipeline/Omit)
- **Row 4 — Win/Loss Analysis** (won/lost counts, cycle times, close reason chart) + **Win Rate by Source**
- **Row 5 — Contract Renewals** (30/60/90 day buckets)

### Tab 3: TEAM (Sales Management)
**Question: "How are reps performing?"**

- **Row 1 — Rep Performance Scorecard** (the table from AdvancedMetrics)
- **Row 2 — Coaching Insights** (talk ratio, question quality, objection handling per rep)
- **Row 3 — Owner Workload** (replaces the duplicate in "More Analytics") + **Rep Pipeline Distribution** (who owns what stages)

### Tab 4: BUYERS (Marketing & Strategy)
**Question: "Who converts and through what channels?"**

The 4 blocks from DashboardPersonaMetrics, **no longer in a collapsible** — they're the primary content:
- **Row 1 — Buyer Type Matrix** + **Acquisition Intent**
- **Row 2 — Channel Attribution** + **Tier vs Outcomes**
- **Row 3 — Operational extras**: Lead Volume chart (16 weeks), Brand Comparison, Service by Brand, Source Breakdown, How SC Found Us, Deals Planned, Role Distribution, Day of Week, Company Leaderboard, Duplicates

Row 3 goes inside a "More Detail" collapsible within this tab.

## What Gets Eliminated / Deduplicated

| Current Duplication | Resolution |
|---|---|
| Win Rate in Hero + AdvancedMetrics + PersonaMetrics | Once in Overview hero, once contextually in Pipeline tab |
| Owner Workload table + Rep Scorecard table | Single Rep Scorecard in Team tab |
| Source Breakdown chart + Lead Source ROI table + Channel Attribution | Source ROI in Pipeline, Channel Attribution in Buyers |
| Pipeline Funnel (hidden) + Stage Conversion (visible) | Funnel in Pipeline tab, conversion bars in Overview |
| Forecast Summary (hidden) + Forecast vs Target (visible) | Combined in Overview + Pipeline |

## Implementation

### Modified: `src/components/Dashboard.tsx`
- Add tab state: `useState<"overview" | "pipeline" | "team" | "buyers">("overview")`
- Render tab bar using the existing design system (border-b-2 pattern from nav)
- Each tab renders its section. Move inline analytics computations into the `analytics` useMemo (already computed)
- Remove the two `Collapsible` wrappers ("More Analytics" and "Buyer Persona Intelligence")

### Modified: `src/components/DashboardAdvancedMetrics.tsx`
- Accept a `section` prop to render only the relevant blocks for each tab
- Or split into exported sub-components: `SalesVelocityCards`, `WinLossAnalysis`, `RepScorecard`, `CoachingInsights`, `ContractRenewals`, `SourceROI`

### Modified: `src/components/DashboardPersonaMetrics.tsx`
- Remove the `Collapsible` wrapper — renders directly in the Buyers tab
- Keep as-is internally, just remove the open/close state

### No new files in Phase 1
All restructuring happens within existing components.

## What Phase 2 Would Cover
- Interactive filters (date range, brand, owner) that persist across tabs
- Click-through from any metric to filtered lead list
- PDF/image export of Overview tab for board reporting
- Geography heatmap in Buyers tab

