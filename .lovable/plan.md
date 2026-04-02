

# Transcript-Derived Metrics for Business Operations Dashboard

## What the Data Reveals (133 meetings, 127 with intelligence)

After analyzing all meeting transcripts, here's what's extractable and actionable:

### Available Intelligence Signals (real data, not fabricated)

| Signal | Data Points | Coverage |
|--------|------------|----------|
| Buying Intent (Strong/Moderate/Low/None) | 127 meetings | 100% |
| Sentiment (Very Positive → Negative) | 127 meetings | 100% |
| Engagement Level (Highly Engaged → Disengaged) | 115 meetings | 91% |
| Talk Ratio (rep vs prospect %) | 113 meetings | 89% |
| Question Quality (Strong/Adequate/Weak) | 115 meetings | 91% |
| Objection Handling (Effective/Partial/Missed) | 115 meetings | 91% |
| Pain Points extracted | 89 unique across meetings | ~70% |
| Objections raised | 29 specific objections | ~23% |
| Competitors mentioned | 20 unique competitors | ~15% |
| Budget/pricing discussed | ~50 meetings with real pricing data | ~40% |
| Buyer Journey stage | 6 meetings (sparse — newer field) | 5% |
| Champion Strength | 6 meetings (sparse — newer field) | 5% |
| Current Solution (incumbent) | 7 meetings with specific tools | 6% |
| Evaluation Criteria | 15 criteria extracted | ~10% |

### Key Findings That Should Be Surfaced

1. **Intent-to-Outcome Correlation**: 6/6 Closed Won had "Strong" intent. 3/4 Closed Lost had "Moderate." Meanwhile, 42 "Strong" intent meetings are stuck in Meeting Held — massive conversion gap.

2. **Coaching Metrics by Outcome**: Won deals average 23.5% talk ratio vs 29% for Meeting Held stage. Lower talk ratio correlates with closing. Question Quality is "Strong" + Objection Handling "Effective" for 100% of won deals, but "Weak"/"Missed" appears in 4 active deals and the 1 Went Dark.

3. **Pricing Intelligence**: Actual price points discussed in ~50 meetings. Range: $2,300–$8,000/mo for Captarget, $3,800–$6,500/mo for SourceCo. Won deals clustered at $2,500–$7,000/mo.

4. **Objection Patterns**: Budget/pricing objections dominate (8/29). "Previous teams not delivering" and "preference against retainers" are recurring themes. SourceCo faces unique "no finder's fee model" and "retainer resistance."

5. **Competitor Landscape**: Grata (4 mentions), Axial (4), Source Scrub (2), Apollo (2), BizBuySell (2). These are tools prospects currently use — not direct competitors.

---

## Proposed New Sections (4 additions across 2 tabs)

### 1. Signal-to-Close Conversion Matrix (Overview tab)
Shows the relationship between transcript signals and deal outcomes.

```text
┌─────────────────────────────────────────────┐
│  Signal-to-Close Conversion                 │
│                                             │
│  Intent    │ Meetings │ Won │ Lost │ Conv%   │
│  Strong    │   62     │  6  │  1   │ 86%     │
│  Moderate  │   57     │  0  │  3   │  0%     │
│  Low/None  │    5     │  0  │  0   │  -      │
│                                             │
│  Engagement│ Meetings │ Won │ Lost │ Conv%   │
│  Highly E. │   68     │  4  │  1   │ 80%     │
│  Engaged   │   42     │  2  │  2   │ 50%     │
│  Passive   │    5     │  0  │  1   │  0%     │
└─────────────────────────────────────────────┘
```

This answers: "Which transcript signals actually predict closing?" Clickable rows drill down to the leads.

### 2. Sales Coaching Scorecard (Operations tab)
Aggregates rep-level coaching metrics from transcripts.

```text
┌─────────────────────────────────────────────┐
│  Sales Coaching Scorecard                   │
│                                             │
│  Rep     │ Avg Talk% │ Q.Quality │ Obj.Hand │
│  Malik   │   27%     │ 95% Strong│ 92% Eff  │
│  Valeria │   31%     │ 88% Strong│ 85% Eff  │
│  Tomos   │   24%     │ 100%      │ 100%     │
│                                             │
│  Benchmark: Won deals avg 23.5% talk ratio  │
│  ⚠ 4 meetings flagged Weak/Missed          │
└─────────────────────────────────────────────┘
```

Uses `talkRatio`, `questionQuality`, `objectionHandling` from meeting intelligence, grouped by `assignedTo`. Shows which reps are closest to the "winning formula."

### 3. Objection & Competitor Heatmap (Forecast tab)
Groups extracted objections into categories and shows frequency + which stages they appear in.

```text
┌─────────────────────────────────────────────┐
│  Top Objections (from transcripts)          │
│                                             │
│  Category        │ Count │ Stages           │
│  Budget/Pricing  │   8   │ MH, PS, CL       │
│  Past Failures   │   3   │ MS, MH            │
│  Retainer Resist │   3   │ MH (SC only)      │
│  Data Quality    │   2   │ MH                │
│                                             │
│  Competitor Mentions                        │
│  Grata: 4 │ Axial: 4 │ SourceScrub: 2     │
│  Apollo: 2 │ BizBuySell: 2               │
└─────────────────────────────────────────────┘
```

### 4. Stuck Pipeline Alert — Intent vs Stage (Operations tab)
Highlights deals with "Strong" intent + "Highly Engaged" that are stuck in Meeting Held for 14+ days. These are the highest-ROI follow-ups.

```text
┌─────────────────────────────────────────────┐
│  ⚡ High-Intent Stuck Deals (42 flagged)    │
│                                             │
│  Name           │ Company    │ Days │ Value │
│  Adam Berman    │ Pos. Sum   │  28  │ $60K  │
│  Timothy Dolan  │ Woody Crk  │  35  │ $42K  │
│  August Meinerz │ Maxus Ops  │  22  │ $24K  │
│  ...clickable to drill down               │
└─────────────────────────────────────────────┘
```

---

## Why These 4 (and not others)

- **Signal-to-Close**: Only metric that tells you *which meeting signals predict revenue*. Currently nowhere in the system.
- **Coaching Scorecard**: Talk ratio data exists for 113 meetings but is only visible per-meeting. Aggregating it per-rep creates an actionable coaching tool.
- **Objection Heatmap**: 29 objections extracted but buried in individual meeting records. Aggregating them reveals *systemic* sales barriers.
- **Stuck Pipeline Alert**: 42 deals showed "Strong" intent but never advanced past Meeting Held. This is your biggest revenue leak and it's invisible today.

**Not included** (too sparse): Buyer Journey (6 data points), Champion Strength (6), Evaluation Criteria (15) — these fields were added recently and don't have enough coverage yet. They'll become useful as more meetings are processed.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardBusiness.tsx` | Add Signal-to-Close Conversion Matrix section below Stage Waterfall |
| `src/components/DashboardOperations.tsx` | Add Sales Coaching Scorecard section and Stuck Pipeline Alert section |
| `src/components/DashboardForecast.tsx` | Add Objection & Competitor Heatmap section below Win/Loss Analysis |

