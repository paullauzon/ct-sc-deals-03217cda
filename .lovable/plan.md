

# Populate Business Metrics with Rational Estimates

## What I Can Estimate (and rationale)

### 1. Won Deal Contract Data (4 deals)

| Deal | subscription_value | billing_frequency | contract_start | contract_end | Rationale |
|------|-------------------|-------------------|----------------|--------------|-----------|
| CT-001 (Alexander Kurian) | $2,500 (fix: currently $0) | Monthly | 2026-03-12 | 2026-09-12 | Banker/Broker Coverage = lighter service, 6-month initial term |
| CT-010 (Michael Madden) | $3,000 (already set) | Monthly | 2026-03-12 | 2026-09-12 | Same service line, same close date, 6-month term |
| CT-174 (Natalie Schubert) | $7,000 (already set) | Monthly | 2026-03-27 | 2027-03-27 | Full Platform = bigger commitment, 12-month term |
| CT-043 (Amy Steacy) | $6,500 (already set) | Monthly | 2026-03-27 | 2027-03-27 | Full Platform, 12-month term |

### 2. Monthly Cost Inputs (business_cost_inputs table)

**Captarget** (Jan, Feb, Mar, Apr 2026):
- **Ad Spend**: $900/mo (user confirmed)
- **Tool Cost**: $250/mo (Fireflies, enrichment APIs, CRM tooling)
- **Sales Cost**: $5,000/mo (Malik handles 95% of 112 leads, this covers his comp allocation)

**SourceCo** (Jan, Feb, Mar, Apr 2026):
- **Ad Spend**: $0 (user confirmed)
- **Tool Cost**: $200/mo (lighter tooling footprint, fewer enrichment calls)
- **Sales Cost**: $3,000/mo (less rep time allocated given 5 assigned leads out of 100)

### 3. Service Line Margins (margin_pct)

| Service | Captarget | SourceCo | Rationale |
|---------|-----------|----------|-----------|
| Off-Market Email Origination | 70% | - | Mostly automated, low delivery cost |
| Direct Calling | 40% | - | Requires calling team, higher labor |
| Banker/Broker Coverage | 50% | - | Moderate effort, relationship-based |
| Full Platform (All 3) | 45% | - | Blended: heavy delivery across all three |
| SourceCo Retained Search | - | 35% | High-touch executive search, labor-intensive |

## What I Cannot Estimate (you need to provide later)

- **Actual sales salaries**: I used $5K/$3K as allocations. Your real numbers could be very different.
- **Google Ads historical spend**: $900 is current. Was it different in Jan/Feb?
- **SourceCo margins**: I don't know SourceCo's delivery model well enough. 35% is a guess.
- **Tool cost breakdown**: If you're paying for LinkedIn Sales Nav, ZoomInfo, or other tools, the $250 estimate could be low.

## Implementation

1. **Update 4 won deals** via SQL: set `subscription_value`, `billing_frequency`, `contract_start`, `contract_end`
2. **Insert 8 rows** into `business_cost_inputs` (2 brands x 4 months) with costs and margin_pct JSON
3. No code changes needed. The Economics and Forecast tabs will immediately reflect the populated data.

## Google Ads Integration (optional follow-up)

Yes, connecting Google Ads would let us auto-populate ad spend. This would require a Google Ads API connector. We can explore that after the core data is populated.

