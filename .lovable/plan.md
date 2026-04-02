

# Fix Business Dashboard Data & Calculation Issues

## What's Actually Wrong

After inspecting the database and code, there are **3 real bugs** and **1 UX issue**:

### Bug 1: LTV shows "Populate contract data" despite data existing
The screenshot shows this placeholder for Captarget even though all 4 won deals now have `contract_start` and `contract_end` populated. This is a **stale data issue** — the SQL update ran after the React app loaded leads into memory. The leads context needs to re-fetch. A simple page refresh fixes this, but we should also add a refresh mechanism or ensure the Economics tab reads fresh data.

**However**, there's a deeper issue: the Economics component loads cost inputs from DB on mount, but relies on the `leads` prop from the parent context which was loaded earlier. If the context cached leads before the SQL update, the contract fields are empty strings (falsy), causing the "Populate" message.

**Fix**: This resolves itself on next page load. No code fix needed — the data is correct in DB.

### Bug 2: "Went Dark" inconsistency across tabs
- `DashboardForecast.tsx` TERMINAL list: `["Closed Won", "Closed Lost", "Duplicate", "Disqualified"]` — **missing "Went Dark"**
- `DashboardOperations.tsx`: includes "Went Dark" ✓
- `DashboardBusiness.tsx`: includes "Went Dark" ✓

This means **Went Dark leads are counted as active pipeline in the Forecast tab**, inflating revenue projections.

**Fix**: Add "Went Dark" to the TERMINAL array in `DashboardForecast.tsx`.

### Bug 3: Forecast also missing "Duplicate" and "Disqualified" in Operations
`DashboardOperations.tsx` TERMINAL list is `["Closed Won", "Closed Lost", "Went Dark"]` — missing "Duplicate" and "Disqualified". These leads would show up in capacity gauges and aging analysis.

**Fix**: Unify terminal stages across all components to `["Closed Won", "Closed Lost", "Went Dark", "Duplicate", "Disqualified"]`.

### UX Issue: SourceCo LTV message is misleading
SourceCo shows "Populate contract_start and contract_end on won deals to calculate LTV" but the real problem is **SourceCo has 0 won deals**. The message should say "No closed won deals yet" instead.

**Fix**: In `DashboardEconomics.tsx`, check `allWon.length === 0` first and show a different message than the "populate contract data" one.

## Calculation Verification

Everything else calculates correctly given the data:
- **April "No closes"** — Correct. All 4 deals closed in March.
- **Cost inputs** — $6,150 Captarget ($5000+$250+$900), $3,200 SourceCo ($3000+$200+$0) ✓
- **Margin table** — Full Platform 8 deals, $33,800, 45%, $15,210 profit ✓
- **Bookings chart** — March should show $19,000 in MRR ($2500+$3000+$7000+$6500) once data refreshes
- **NRR** — All 4 contracts active (end dates in Sept 2026 and March 2027), so NRR = 100% ✓
- **Revenue concentration** — Natalie Schubert ($7K) = 36.8% of $19K total, correctly flagged as high concentration ✓

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardForecast.tsx` | Add "Went Dark" to TERMINAL array |
| `src/components/DashboardOperations.tsx` | Add "Duplicate", "Disqualified" to TERMINAL_STAGES array |
| `src/components/DashboardEconomics.tsx` | Add check for `allWon.length === 0` to show "No won deals" message instead of misleading "populate contract data" message |

