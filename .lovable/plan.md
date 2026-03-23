

# Persona Analytics for Pipeline Dashboard

## What We Have vs What's Missing

**Currently tracked per-lead but NOT surfaced on dashboard:**
- `buyerType` (Private Equity, Corporate, Independent Sponsor, Advisor/Banker, Search Fund, Other)
- `role` (only raw role distribution, no conversion analysis)
- `acquisitionStrategy` (actively sourcing vs thesis-building mode)
- `icpFit` (Strong / Moderate / Weak)
- `tier` (1-4 lead scoring tiers)
- `stage1Score` / `stage2Score` (AI-generated lead quality scores)
- `dealsPlanned` (volume intent signal)
- `serviceInterest` (shown as simple count, not correlated with outcomes)
- `hearAboutUs` (shown for SC only, not correlated with conversion)
- `geography` / `targetRevenue` (buyer profile signals)

**The gap:** The dashboard shows *what's happening* (pipeline funnel, velocity, rep performance) but not *who converts and why*. A sales veteran needs to know which **buyer profiles** close, which **channels produce quality**, and where to focus outreach.

## Proposed Persona Intelligence Section

A new collapsible section titled **"Buyer Persona Intelligence"** placed between the Pipeline Snapshots row and the DashboardAdvancedMetrics. Contains 4 analytical blocks:

### Block 1: Buyer Type Performance Matrix
A table showing each `buyerType` (PE, Corporate, Ind. Sponsor, Advisor, Search Fund) with:
- Lead count
- Pipeline value (active deals)
- Won count + won value
- Win rate (% of closed that converted)
- Avg deal size (won deals)
- Avg cycle days (won deals)
- ICP fit distribution (Strong/Moderate/Weak counts)

**Why:** Instantly shows which buyer archetypes close fastest at highest values. If PE firms win at 40% but Corporates at 10%, you know where to double down.

### Block 2: Acquisition Intent Segmentation
Two-row comparison: "Actively Sourcing" vs "Thesis-Building Mode" with:
- Lead count, pipeline value, win rate, avg cycle
- A horizontal stacked bar showing stage distribution for each segment

**Why:** "Actively sourcing" buyers should close faster. If they don't, something is wrong with your pitch or qualification. This is the fastest campaign-tuning signal.

### Block 3: Channel-to-Close Attribution
Extends the existing `hearAboutUs` data (currently SC-only) to show for ALL leads by `source`:
- Each channel (Google, LinkedIn, ChatGPT, Perplexity, Referral, etc.) with:
  - Leads generated
  - Meeting set rate (% that reached Meeting Set or beyond)
  - Win rate
  - Avg deal value (won)
  - Revenue generated

**Why:** Marketing ROI. If ChatGPT referrals produce 3x the deal value of Google, you optimize content for AI search. This is the most actionable campaign metric.

### Block 4: Lead Quality Tiers vs Outcomes
A compact 4-row table (Tier 1 through Tier 4) showing:
- Count per tier
- Stage distribution (mini horizontal bar)
- Win rate per tier
- Avg deal value per tier
- Pipeline value per tier

Below it: a single-line "Scoring Accuracy" metric — correlation between tier and actual win rate. If Tier 1 wins at 50% and Tier 4 at 5%, scoring works. If flat, scoring needs recalibration.

**Why:** Validates your AI lead scoring. If Tier 3 leads win more than Tier 1, the model is miscalibrated and you're wasting time on the wrong prospects.

## Implementation

### New file: `src/components/DashboardPersonaMetrics.tsx`
A single component that receives `leads` and `onSelectLead` props. Computes all 4 blocks from the lead data using `useMemo`. Uses the same design system: monochrome borders, uppercase tracking-wider labels, tabular-nums, horizontal bar fills for rates.

### Modified file: `src/components/Dashboard.tsx`
Import and render `<DashboardPersonaMetrics>` inside a new collapsible section between Pipeline Snapshots and Advanced Metrics. Uses the same `Collapsible` pattern as "More Analytics".

## Visual Layout

```text
┌─────────────────────────────────────────────────────┐
│ ▸ BUYER PERSONA INTELLIGENCE                        │
├─────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌──────────────────────┐  │
│ │ BUYER TYPE MATRIX    │  │ ACQUISITION INTENT    │  │
│ │ PE    12  $340K  38% │  │ Actively Sourcing ██░ │  │
│ │ Corp   8  $120K  15% │  │ Thesis-Building   █░░ │  │
│ │ IndSp  5  $200K  25% │  │                       │  │
│ │ Advsr  3   $80K  10% │  │ ──stage bars──        │  │
│ └──────────────────────┘  └──────────────────────┘  │
│ ┌──────────────────────┐  ┌──────────────────────┐  │
│ │ CHANNEL → CLOSE      │  │ TIER vs OUTCOMES      │  │
│ │ Google    15  22% $8K│  │ T1  ██████ 45% $15K   │  │
│ │ ChatGPT    8  35% 12K│  │ T2  ████░░ 28% $10K   │  │
│ │ LinkedIn   6  18% $7K│  │ T3  ██░░░░ 12%  $6K   │  │
│ │ Referral   4  50% 15K│  │ T4  █░░░░░  3%  $4K   │  │
│ └──────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/DashboardPersonaMetrics.tsx` | New component with 4 analytical blocks |
| `src/components/Dashboard.tsx` | Import and render in collapsible section |

