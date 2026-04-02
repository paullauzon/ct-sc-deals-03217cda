

# Phase 4: Forecast Tab (Revenue Projections & Retention)

## What Gets Built

The **Forecast** tab becomes fully functional with four sections:

1. **Bottoms-Up 3-Month Revenue Projection** — Each active deal multiplied by its stage probability weight, grouped by expected close month (derived from avg cycle time per stage). Displayed as a stacked bar chart (Captarget vs SourceCo) for current month + next 2 months.

2. **Monthly Bookings vs Target** — Running chart of new MRR booked (deals that moved to Closed Won) per month, with a configurable target line. Uses `closedDate` to determine booking month.

3. **Net Revenue Retention (NRR)** — For won deals with contract data populated: starting MRR vs current MRR accounting for churn (expired contracts). Shows NRR % with health indicator. Placeholder state if contract dates aren't populated.

4. **Revenue Concentration Risk** — Top customers by MRR as a percentage of total. Flags if any single customer represents >25% of revenue. Clickable for drill-down.

## Stage-to-Close Estimation

For the projection chart, estimate months-to-close from current stage using average cycle days from existing won deals. Fallback defaults if insufficient data:

```text
New Lead: 90d, Qualified: 75d, Contacted: 60d, Meeting Set: 45d,
Meeting Held: 30d, Proposal Sent: 21d, Negotiation: 14d, Contract Sent: 7d
```

## UI Layout

```text
┌─────────────────────────────────────────────────┐
│  3-Month Revenue Projection (stacked bar chart)  │
├─────────────────────┬───────────────────────────┤
│  Monthly Bookings   │  NRR / Retention          │
├─────────────────────┴───────────────────────────┤
│  Revenue Concentration Risk (table + warning)    │
└─────────────────────────────────────────────────┘
```

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardForecast.tsx` | New component with all 4 sections: projection bar chart (using Recharts via existing chart.tsx), bookings tracker, NRR card, concentration risk table |
| `src/components/BusinessSystem.tsx` | Mark forecast tab `ready: true`, render `DashboardForecast` with `leads` and `onDrillDown` props |

