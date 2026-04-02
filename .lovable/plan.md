

# Phase 3: Operations Tab (Capacity and Pipeline Health)

## What Gets Built

The **Operations** tab becomes fully functional with four sections:

1. **Rep Capacity Utilization** — Per-rep gauge showing active deals vs a configurable healthy threshold (default 25). Color-coded: green (under), yellow (at), red (over). Grouped by brand.

2. **Pipeline Aging by Brand** — Average days in stage for each active stage, split by Captarget and SourceCo. Highlights stages where avg age exceeds thresholds (7d yellow, 14d orange, 21d+ red).

3. **Pipeline Coverage Ratio** — Weighted pipeline value (deal value x stage probability) vs a configurable quarterly revenue target. Shows coverage multiplier with health indicator (green >3x, yellow 1-3x, red <1x). One card per brand.

4. **Stale Pipeline & Dark Pipeline** — Deals with no contact >30 days, grouped by brand. Shows count, total value at risk, and a clickable list that triggers the drill-down sheet. Separate section for leads approaching "dark" status (14-30 days no contact).

## Stage Probability Weights

Used for weighted pipeline and coverage ratio:

```text
New Lead: 5%, Qualified: 15%, Contacted: 20%, Meeting Set: 30%,
Meeting Held: 40%, Proposal Sent: 60%, Negotiation: 75%, Contract Sent: 90%
```

## UI Layout

```text
┌─────────────────────────────────────────────────┐
│  Rep Capacity (gauges per rep, 2-col grid)       │
├─────────────────────┬───────────────────────────┤
│  Coverage Ratio CT  │  Coverage Ratio SC        │
├─────────────────────┴───────────────────────────┤
│  Pipeline Aging (table: stage x brand, avg days) │
├─────────────────────────────────────────────────┤
│  At-Risk Pipeline (stale + going dark cards)     │
└─────────────────────────────────────────────────┘
```

## Drill-Down Support

The Operations tab needs access to `onDrillDown` from BusinessSystem. Update the component interface to accept `onDrillDown` callback. Clicking stale/dark pipeline cards opens the sheet with the relevant leads.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardOperations.tsx` | New component with all 4 sections: capacity gauges, coverage ratio cards, aging table, at-risk pipeline |
| `src/components/BusinessSystem.tsx` | Mark operations tab `ready: true`, render `DashboardOperations` with `leads` and `onDrillDown` props |

