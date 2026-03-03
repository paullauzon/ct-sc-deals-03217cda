

# Dashboard & System Enhancements

## Verification: Reactivity

The dashboard already computes all analytics via `useMemo` dependent on `leads` and `getMetrics()`. Any lead added, stage changed, or service interest updated in the Pipeline or Leads Table triggers a re-render of the context, which propagates to the Dashboard. This is working correctly by design — no fix needed.

## Changes

### 1. Add "SourceCo Retained Search" as a service option

**`src/types/lead.ts`** — Add `"SourceCo Retained Search"` to the `ServiceInterest` union type.

**`src/components/LeadsTable.tsx`** — Add it to the `SERVICES` array (line 12).

**`src/components/Dashboard.tsx`** — Add it to the `serviceData` computation (line 126).

### 2. Upgrade Lead Volume chart to be more sophisticated

Replace the simple line chart with an `AreaChart` showing stacked CT + SC volumes with a cumulative total line overlay. Add:
- Stacked area fills (CT dark, SC lighter) so you see total volume AND brand split
- A cumulative running total line on a secondary Y-axis
- Weekly totals shown in the tooltip
- Taller chart (280px instead of 220px)

### 3. Upgrade "How SC Leads Found Us" to a horizontal bar chart

Replace the plain list with a `BarChart` (horizontal layout) using recharts. Each channel gets a bar with count labels. Adds percentage of total next to each bar via a custom tooltip.

### 4. Add new dashboard sections for deeper decision-making

**A. Conversion Funnel by Brand** — Two side-by-side mini funnels (CT vs SC) showing stage distribution per brand, so you can compare which brand converts better at each stage.

**B. Service Interest by Brand** — A grouped comparison showing CT vs SC service interest breakdown side by side, so you can see demand patterns per brand. This will immediately reflect any "SourceCo Retained Search" selections.

**C. Lead Velocity Rate (LVR)** — A computed metric showing the rate of qualified leads entering the pipeline per week (trending). This is the single most important SaaS/sales metric for predicting future revenue.

**D. Stale Leads Alert** — A section highlighting leads that have been in their current stage for >14 days (excluding Closed stages). Shows count and lists the top 5 stalest leads with clickable rows to open detail. Critical for pipeline hygiene.

**E. Priority Distribution** — A small breakdown of High/Medium/Low priority leads with counts, so you can see if enough leads are being triaged as high priority.

**F. Forecast Summary** — Breakdown by forecast category (Commit, Best Case, Pipeline, Omit) with associated dollar values. Essential for revenue forecasting.

### 5. Dashboard layout restructuring

Reorder sections for decision-making flow:
1. Hero metrics (existing)
2. Secondary metrics (existing, add LVR)
3. Brand Comparison (existing)
4. Lead Volume (upgraded area chart)
5. Pipeline Funnel + Conversion by Brand (side by side)
6. Stale Leads Alert (new — high visibility)
7. Source Breakdown + "How SC Found Us" (upgraded chart)
8. Service Interest by Brand (new) + Forecast Summary (new)
9. Role Distribution + Priority Distribution (new)
10. Company Leaderboard (existing)
11. Deals Planned + Day of Week + Duplicates (existing)
12. Recent Leads (existing)

## Files Changed

| File | Changes |
|------|---------|
| `src/types/lead.ts` | Add "SourceCo Retained Search" to ServiceInterest |
| `src/components/LeadsTable.tsx` | Add to SERVICES array |
| `src/components/Dashboard.tsx` | Full rebuild: area chart, horizontal bar chart for SC channels, conversion by brand, service by brand, stale leads, priority distribution, forecast summary, LVR metric |

