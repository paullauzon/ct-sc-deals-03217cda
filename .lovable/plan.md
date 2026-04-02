

# Phase 2: Unit Economics Tab

## What Gets Built

The **Economics** tab in the Business Operations system becomes fully functional with three sections:

1. **Cost Configuration Panel** — Editable monthly cost inputs per brand (sales salaries, tool costs, ad spend) stored in a new `business_cost_inputs` database table
2. **CAC & LTV Cards** — Per-brand Customer Acquisition Cost (total costs / new customers) and Lifetime Value (avg subscription x avg contract months). LTV shows "Populate contract dates" placeholder until contract fields are filled on won deals
3. **Gross Margin by Service Line** — Configurable cost-to-deliver assumptions per service type, showing margin % against actual deal values in pipeline

## Database

New table: `business_cost_inputs`

```text
id              uuid (PK, default gen_random_uuid())
brand           text NOT NULL ('Captarget' or 'SourceCo')
month           text NOT NULL (e.g. '2026-04')
sales_cost      numeric DEFAULT 0
tool_cost       numeric DEFAULT 0
ad_spend        numeric DEFAULT 0
margin_pct      jsonb DEFAULT '{}'  (e.g. {"Off-Market Email Origination": 70, "Full Platform (All 3)": 30})
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
UNIQUE(brand, month)
```

RLS: Allow all (matches existing pattern, no auth).

## UI Components

### Cost Config (collapsible panel at top of Economics tab)
- Month selector (defaults to current month)
- Two columns (Captarget / SourceCo), each with 3 number inputs: Sales Cost, Tool Cost, Ad Spend
- Service margin inputs: one row per service type with a % input
- Save button persists to `business_cost_inputs` via Supabase

### CAC Cards (per brand)
- Total Monthly Cost (sum of sales + tools + ad)
- New Customers This Month (count of leads moved to Closed Won in selected month)
- **CAC = Total Cost / New Customers** (or "No closes this month" if 0)
- LTV: avg subscription value x avg contract duration in months (or placeholder if no contract dates)
- LTV:CAC ratio with color coding (green >3, yellow 1-3, red <1)

### Gross Margin Table
- Rows: each ServiceInterest value that has active deals
- Columns: Deal Count, Total Value, Margin % (from config), Estimated Gross Profit
- Subtotals per brand

## Files Changed

| File | Changes |
|------|---------|
| Migration | Create `business_cost_inputs` table with RLS |
| `src/components/DashboardEconomics.tsx` | New component: cost config panel, CAC/LTV cards, margin table |
| `src/components/BusinessSystem.tsx` | Mark economics tab as `ready: true`, render `DashboardEconomics` when selected |

