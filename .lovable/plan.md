

# Fix: Avg Deal Size Should Reflect Won Deals

## The Problem

The "Avg Deal Size" metric on the Brand Scorecards currently calculates from **all active deals** with a deal value. For SourceCo with 0 closed won deals, it shows $29,875 — which is just the average pipeline estimate, not actual realized deal sizes. This is misleading next to metrics like MRR and Win Rate which are based on actual outcomes.

## The Fix

Change the calculation to use **Closed Won deals only**. If no deals are won yet, show "N/A" (consistent with how Win Rate already handles this). This makes the metric honest — it answers "what do our won deals actually look like?" not "what are we hoping pipeline deals are worth?"

```
// Current (misleading):
const activeWithValue = active.filter(l => l.dealValue > 0);
const avgDealSize = activeWithValue.reduce(...) / activeWithValue.length;

// Fixed:
const wonWithValue = won.filter(l => l.dealValue > 0);
const avgDealSize = wonWithValue.length > 0
  ? Math.round(wonWithValue.reduce((s, l) => s + l.dealValue, 0) / wonWithValue.length)
  : 0;
```

Captarget will show ~$6,543 (from 4 won deals). SourceCo will show "N/A" (0 won deals).

Optionally, add a second metric "Avg Pipeline Deal" if you still want visibility into pipeline estimates — but the primary "Avg Deal Size" should always mean closed business.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardBusiness.tsx` | Change `avgDealSize` calculation from active deals to won deals |

