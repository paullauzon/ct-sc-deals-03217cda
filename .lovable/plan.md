

# Complete Transcript Intelligence Extraction Strategy

## Current Floor (What's Already Surfaced)

The Business Operations dashboard currently surfaces these transcript-derived metrics:
- Signal-to-Close Conversion Matrix (intent + engagement vs outcomes)
- Sales Coaching Scorecard (talk ratio, question quality, objection handling per rep)
- Stuck Pipeline Alert (high-intent deals stuck 14+ days)
- Objection & Competitor Heatmap (objection frequency + competitor mentions)

The Intel tab separately covers: signal distributions, competitive radar, loss intelligence, coaching, and GTM insights.

---

## The Ceiling: What's Buried in the Data (and Not Yet Surfaced)

### Tier 1: High Coverage, High Impact (100+ data points)

**1. Pricing Intelligence Dashboard** (123 meetings with pricing data, 65 with explicit budgets)
- Actual price points discussed: $2,000-$8,000/mo for Captarget, $3,300-$6,500/mo for SourceCo
- Won deals clustered at $2,500-$7,000/mo range
- Budget-to-close correlation: prospects who stated specific budgets vs those who didn't — what's the conversion difference?
- Price sensitivity mapping: which price points get pushback vs acceptance, by service tier
- **COO value**: Answers "are we pricing correctly?" and "where are we leaving money on the table?"

**2. Urgency Driver Taxonomy** (149 urgency drivers extracted)
- Top themes: "need systematic M&A process," "current sourcing partner underperforming," "deal flow increase needed"
- Currently invisible — buried in individual meeting records
- Can categorize into: Competitive Pressure, Resource Constraints, Market Timing, Incumbent Failure, Growth Mandate
- Correlate urgency categories with close rates
- **COO value**: Tells marketing which pain narratives to lead with in ads/content

**3. Value Proposition Effectiveness** (120 meetings with value_prop data)
- What Captarget/SourceCo value prop resonated in won vs lost deals
- Won: "outsourced BD approach relieving bandwidth burden," "no success fee model," "both on/off market strategies"
- Lost: "customized outreach with transparent pricing" — same messaging, different outcome
- **COO value**: Refine sales pitch. Know which value angles close and which don't.

**4. Sentiment Trajectory Analysis** (127 meetings with sentiment)
- Won deals: 83% Positive, 17% Very Positive, 0% Neutral/Cautious
- Lost deals: 75% Positive, 25% Very Positive (counterintuitive — sentiment alone doesn't predict losses)
- Neutral sentiment = 0 wins across 7 meetings (strong negative predictor)
- **COO value**: Sentiment is a necessary-but-not-sufficient condition. Combine with action item completion for true predictive power.

**5. Action Item Completion Crisis** (169 action items tracked, 131 still "Open")
- Only 10 completed out of 169 (5.9% completion rate)
- This is a massive operational red flag — promises being made in meetings and not followed through
- Can break down by rep: who's dropping the ball?
- Correlate completion rates with deal outcomes
- **COO value**: Single biggest controllable factor in deal conversion. Fix this, close more deals.

### Tier 2: Moderate Coverage, Strategic Value (20-85 data points)

**6. Deal Temperature + Momentum Matrix** (85 deals with deal intelligence)
- 74 deals rated "Warm," 6 "Lukewarm," 2 "Cold," 2 "On Fire"
- 66 "Steady" momentum, 17 "Accelerating," 2 "Stalling/Stalled"
- Cross-reference: "Warm + Steady" = 60+ deals sitting in neutral. "Warm + Accelerating" = 17 deals actively progressing
- **COO value**: Dashboard showing which deals need a push (Warm+Steady for too long) vs which are self-propelling

**7. Stakeholder Influence Map Aggregation** (195 stakeholders mapped across 85 deals)
- 39 Champions who are Decision Makers
- 16 Neutral Decision Makers (deals at risk — no internal advocate)
- 40 "Supporter/Medium" — passive goodwill but no power
- **COO value**: Deals with Neutral Decision Makers and no Champion = systematically at risk. Flag these for executive-level engagement.

**8. Risk Register Aggregation** (85 deals with risk registers, 23 total risk factors)
- Risk severity distribution across active pipeline
- Unmitigated vs Partially Mitigated vs Mitigated — what percentage of pipeline risk is addressed?
- Common risk patterns: budget constraints, CEO approval dependency, competitor engagement, internal team capacity
- **COO value**: Portfolio-level risk view. "How much of our pipeline has unmitigated critical risks?"

**9. Win Strategy Intelligence** (83 deals with win strategies)
- Closing windows: most say "30 days" or "next quarter" — are they actually closing in that window?
- Number One Closer themes: "demonstrate ROI," "case studies," "trial/pilot program" — which closing tactics correlate with wins?
- Power Moves: what types of power moves were recommended vs executed?
- **COO value**: Build a playbook from what actually works, not theory.

**10. Multi-Meeting Deal Patterns** (20+ leads with 2+ meetings)
- Rish Sharma: 5 meetings, $40K deal, still in Meeting Held — meeting fatigue or genuine complexity?
- Won deals averaged how many meetings before close?
- Is there a "meeting count sweet spot"? (too few = not enough trust, too many = stalling)
- **COO value**: Optimal meeting cadence per deal size. "After 3 meetings with no advancement, change strategy."

**11. Decision Process Intelligence** (120 meetings with decision process data)
- Patterns: "internal review by committee," "sole decision maker," "board approval required," "pending partner discussion"
- Correlate decision complexity with cycle time and win rate
- Solo decision makers close faster? Committee deals need different strategy?
- **COO value**: Adjust sales approach based on decision structure. Prioritize solo-DM deals for speed.

### Tier 3: Emerging Data, Future Value (5-27 data points)

**12. Competitive Displacement Intelligence** (11 structured competitor details, 50 total mentions)
- Current solutions being used: Apollo, Source Scrub, RADA, PitchBook, Clay, Pod, internal teams
- Prospect sentiment toward incumbents: 3 "Unfavorable" (opportunity), 5 "Neutral" (need differentiation), 3 "Mixed" (risk)
- Switching barriers: 14 unique barriers identified (existing relationships, regulatory, self-sufficiency)
- **COO value**: Displacement playbooks per competitor. "When they use Apollo, lead with X."

**13. Evaluation Criteria Mapping** (27 criteria extracted)
- Top: Price (2x), Lead Quality (2x), Service Flexibility, Industry Expertise
- Can map which criteria won deals prioritized vs lost deals
- **COO value**: Adjust pitch emphasis. If "Lead Quality" wins deals but "Price" loses them, lead with quality.

**14. Speed-to-Meeting Correlation** (42 leads with hours_to_meeting_set)
- Captarget Meeting Held: avg 210 hours (8.75 days), range 3-1342 hours
- Won deals: avg 438 hours but high variance (6 to 1194 hours) — small sample
- SourceCo: faster at avg 153 hours for Meeting Held
- **COO value**: Response time benchmarking. Not yet enough data to be definitive but trending.

**15. Buyer Journey & Champion Strength** (6 data points each — too sparse for dashboard)
- Worth tracking but need 30+ data points before surfacing
- Recommendation: keep extracting, build dashboard widget when coverage hits 20%

---

## What Should Be Built (Prioritized)

### Must-Build (Data exists, high COO impact, not surfaced anywhere)

| # | Section | Tab | Why |
|---|---------|-----|-----|
| 1 | **Action Item Completion Tracker** | Operations | 5.9% completion rate is a crisis. Show per-rep completion rates, overdue items, and dropped promises. This is the single most actionable metric. |
| 2 | **Pricing Intelligence** | Economics | Price ranges discussed vs won price points. Shows optimal pricing corridors per brand and service type. |
| 3 | **Deal Temperature & Momentum Grid** | Operations | 60+ deals sitting "Warm + Steady" — surface which need intervention vs which are progressing |
| 4 | **Stakeholder Risk Heatmap** | Forecast | 16 deals with Neutral Decision Makers and no Champion = highest risk. Flag for executive engagement. |
| 5 | **Urgency Driver Taxonomy** | Overview | Categorized urgency drivers with frequency. Tells marketing and sales what language resonates. |

### Should-Build (Strategic but lower urgency)

| # | Section | Tab | Why |
|---|---------|-----|-----|
| 6 | **Meeting Count vs Outcome** | Operations | Optimal meeting cadence analysis. "After N meetings, convert or deprioritize." |
| 7 | **Decision Process Complexity** | Forecast | Solo DM vs committee deals — different strategies needed |
| 8 | **Value Prop Effectiveness** | Overview | Which pitch angles close vs which don't |
| 9 | **Risk Portfolio View** | Forecast | Aggregate unmitigated risks across pipeline |
| 10 | **Competitive Displacement Playbook** | Overview | Per-incumbent displacement strategies |

### Not Yet (Insufficient data)

- Buyer Journey Distribution (6 data points)
- Champion Strength Overview (6 data points)
- Speed-to-meeting causation (42 points, high variance)

---

## Data Sources Summary

All metrics above use data already in the database. No fabrication required:

| Source | Field Path | Coverage |
|--------|-----------|----------|
| Meeting intelligence | `meetings[].intelligence.*` | 127/133 meetings |
| Deal intelligence | `deal_intelligence.*` | 85/94 leads with meetings |
| Pricing discussions | `meetings[].intelligence.pricingDiscussion` | 123 meetings |
| Budget mentioned | `meetings[].intelligence.dealSignals.budgetMentioned` | 65 meetings |
| Action items | `deal_intelligence.actionItemTracker[]` | 85 leads, 169 items |
| Stakeholder map | `deal_intelligence.stakeholderMap[]` | 85 leads, 195 stakeholders |
| Win strategy | `deal_intelligence.winStrategy` | 83 leads |
| Momentum signals | `deal_intelligence.momentumSignals` | 85 leads |
| Risk register | `deal_intelligence.riskRegister[]` | 85 leads |
| Urgency drivers | `meetings[].intelligence.dealSignals.urgencyDrivers[]` | 149 items |
| Decision process | `meetings[].intelligence.dealSignals.decisionProcess` | 120 meetings |
| Current solution | `meetings[].intelligence.dealSignals.currentSolution` | 7 specific tools |
| Evaluation criteria | `meetings[].intelligence.dealSignals.evaluationCriteria[]` | 27 criteria |
| Switching barriers | `meetings[].intelligence.dealSignals.switchingBarriers[]` | 14 barriers |

---

## The One Metric That Matters Most

**Action item completion rate: 5.9%.**

131 out of 169 action items are still "Open." This means promises made in sales meetings — "I'll send you the proposal," "We'll schedule a follow-up," "I'll share case studies" — are systematically not being tracked or executed. This is almost certainly the primary reason 42 "Strong Intent" deals are stuck in Meeting Held. The intelligence exists. The follow-through doesn't.

Building an Action Item Completion dashboard per rep with overdue alerts would likely have more revenue impact than any other single feature in this system.

