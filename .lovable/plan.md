

# Enhance Business Operations Dashboard

## What's Missing (High-Impact Gaps)

After reviewing all 4 tabs, here are the additions that would make this dashboard genuinely actionable rather than just informational:

### 1. Brand P&L Summary Card (Overview tab)
Right now the Overview shows metrics but never answers "are we profitable?" Add a simple Revenue - Costs = Profit card per brand at the top. Captarget: $19K MRR - $6.15K costs = $12.85K/mo margin. SourceCo: $0 MRR - $3.2K costs = -$3.2K/mo burn. This is the single most important number for a COO and it's nowhere on the dashboard.

### 2. Stage Conversion Waterfall (Overview tab)
The source funnel shows where leads come from but not where they die. Add a stage-to-stage conversion rate: New Lead → Qualified (X%), Qualified → Meeting Set (X%), etc. Per brand. This immediately tells you which stage is the bottleneck. If 80% of SourceCo leads never leave New Lead, that's a different problem than if they all get to Meeting Held but never close.

### 3. Deal Velocity Timeline (Operations tab)
Average days between each stage transition, not just "days in current stage." How long from Meeting Held → Proposal Sent? From Proposal → Negotiation? This uses the activity log data you already have. It answers "where does the process stall?"

### 4. Win/Loss Analysis (Forecast tab)
You have `wonReason`, `lostReason`, and `closeReason` fields on leads. Surface them as a grouped breakdown: top 3 reasons deals close, top 3 reasons they don't. Per brand. Right now you have 4 wins and 2 losses — small sample, but the pattern matters as it grows.

### 5. Pipeline Momentum Indicator (Operations tab)
Net pipeline change this month: new deals added minus deals lost/closed. Shows if you're building or depleting. A simple +$X / -$X with a trend arrow. If you added $50K in pipeline but closed $19K and lost $30K, net momentum is +$1K — barely treading water.

### 6. Lead Response Time (Overview tab)
Time from `dateSubmitted` to first stage change (or `lastContactDate`). Average per brand. This is a leading indicator — faster response = higher conversion. You have the data, it's just not surfaced.

### 7. Monthly Trend Sparklines on Scorecards (Overview tab)
The brand scorecards show static numbers. Add tiny sparklines showing the last 3-4 months of each metric (leads, pipeline value, win rate). Static numbers don't tell you if things are improving or deteriorating.

### 8. Payback Period Card (Economics tab)
You show CAC and LTV separately but not the direct answer: "How many months until a customer pays for their acquisition cost?" CAC / MRR = payback months. For Captarget: $1,537 / $4,750 avg MRR ≈ 0.3 months. That's exceptional and should be highlighted.

## Priority Order (what to build first)

| Priority | Addition | Why |
|----------|----------|-----|
| 1 | Brand P&L Summary | Answers "are we making money" — the #1 COO question |
| 2 | Stage Conversion Waterfall | Identifies exactly where the process breaks |
| 3 | Payback Period | Completes the unit economics story |
| 4 | Pipeline Momentum | Shows trajectory, not just position |
| 5 | Lead Response Time | Actionable operational metric |
| 6 | Win/Loss Analysis | Grows in value as deal count increases |
| 7 | Deal Velocity Timeline | Requires activity log mining |
| 8 | Monthly Trend Sparklines | Polish — nice but not urgent |

## Estimated Build

2 responses:
- **Response 1**: Brand P&L card, stage conversion waterfall, payback period, pipeline momentum
- **Response 2**: Lead response time, win/loss analysis, deal velocity, sparklines

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardBusiness.tsx` | Add Brand P&L summary cards, stage conversion waterfall table, lead response time metric |
| `src/components/DashboardEconomics.tsx` | Add payback period card below LTV:CAC ratio |
| `src/components/DashboardOperations.tsx` | Add pipeline momentum indicator card |
| `src/components/DashboardForecast.tsx` | Add win/loss analysis section |

