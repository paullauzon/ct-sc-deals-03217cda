

# Build Business Operations Dashboard

## Scope Estimate: 4 responses

| Response | What gets built |
|----------|----------------|
| **1** | New `DashboardBusiness.tsx` component with Brand Scorecards (side-by-side CT vs SC cards showing Total Leads, Active Pipeline, MRR, Win Rate, Avg Deal Size, Avg Cycle Days, Leads per Rep) + Source-level conversion funnel. Wire as 6th tab in `Dashboard.tsx`. |
| **2** | Unit Economics section: new `business_cost_inputs` DB table for monthly cost/margin assumptions per brand. UI for configuring costs. CAC, LTV, LTV:CAC ratio calculations (LTV will show "needs contract data" until you populate the 4 won deals). Gross margin by service line with configurable cost-to-deliver assumptions. |
| **3** | Operational Health section: Rep capacity utilization gauges (active deals vs healthy threshold), pipeline coverage ratio with quarterly target input, pipeline aging by brand (avg days in stage), stale pipeline value (deals with no contact >30 days), time-to-value speed metrics derived from activity log stage transitions. |
| **4** | Revenue forecasting: bottoms-up 3-month projection (deal value x stage probability x expected close), monthly bookings vs target line chart, net revenue retention placeholder (activates when contract dates populated). Polish, drill-downs on all metrics, PNG export support. |

## Architecture

- One new file: `src/components/DashboardBusiness.tsx` (all 4 responses build into this file incrementally)
- One new DB table: `business_cost_inputs` (brand, month, sales_cost, tool_cost, ad_spend, margin assumptions per service line)
- Dashboard.tsx: add "Business" as 6th tab in the `TABS` array and `DashboardTab` type
- Reuses existing filter bar, drill-down sheet, and brand color patterns
- All metrics computed client-side from the `leads` array (same pattern as existing dashboard tabs)
- Cost inputs stored in DB so they persist across sessions

## What you need to do

Populate `contract_start`, `contract_end`, and `billing_frequency` on your 4 Closed Won deals. Without these, LTV and retention metrics will show placeholder states. Everything else works from existing data.

