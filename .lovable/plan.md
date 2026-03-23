

# Phase 7: Intelligence Command Center — Dedicated 5th Tab

## The Problem

Right now, intelligence is scattered:
- `DashboardSignalIntelligence` (4 blocks) sits at the bottom of the Overview tab — buried under KPIs, snapshots, funnels, and trends
- `DashboardCompetitiveRadar` (3 blocks) sits at the bottom of the Pipeline tab — buried under funnel, stale leads, forecast, and loss intelligence
- `DashboardLossIntelligence` (6 blocks) is also in Pipeline tab
- Meeting coaching metrics are in the Team tab

Nobody scrolls that far. The most valuable data in your system is the least visible. A dedicated tab solves this and lets us go much deeper.

## What Changes

### 1. New Top-Level Tab: "Intel"

Add a 5th tab to `Index.tsx`: **Intel** (icon: `Brain`) — positioned between Pipeline and Leads. Description: "Signal Center". This becomes the single destination for all intelligence derived from transcripts, deal synthesis, enrichment, and behavioral signals.

### 2. New Component: `IntelligenceCenter.tsx`

A full-page intelligence command center with its own sub-tabs:

```text
[ Signals ] [ Competitors ] [ Risks ] [ Coaching ] [ GTM Insights ]
```

#### Sub-tab 1: Signals (the "War Room" view)

**Relocates and expands** `DashboardSignalIntelligence` content. Same 4 blocks (Intent Radar, Pain Points, Objection Readiness, Stakeholder Power Map) but with these additions:

**NEW Block 5: Sentiment Tracker (All Pipeline)**
- Aggregate sentiment across ALL leads with meetings — not just active, not just lost
- Show distribution: Very Positive / Positive / Neutral / Cautious / Negative with lead counts and pipeline value
- Show sentiment shift: compare last meeting sentiment vs first meeting sentiment per lead, count how many improved vs declined vs stayed flat
- "X% of deals show improving sentiment" — the leading indicator of pipeline health

**NEW Block 6: Fear & Motivation Map**
- Aggregate `dealIntelligence.psychologicalProfile.fearFactor` across all leads with deal intelligence
- Aggregate `psychologicalProfile.emotionalTriggers` 
- Aggregate `psychologicalProfile.realWhy` (the real buying motivation)
- Group and normalize themes — show top 8 fears and top 8 motivations with frequency
- Cross-reference with outcomes: which fears correlate with won vs lost?
- This tells marketing exactly what emotional messaging to use

**NEW Block 7: Decision Process Intelligence**
- Aggregate `meetings[].intelligence.dealSignals.decisionProcess` across all leads
- Group similar processes (e.g., "Board approval required", "IC vote", "Single decision maker")
- Show which decision processes correlate with faster closes vs. stalls
- Cross-reference with `dealIntelligence.buyingCommittee` — how many decision makers, influencers, blockers on average per process type

#### Sub-tab 2: Competitors

**Relocates and expands** `DashboardCompetitiveRadar` content. Same 3 blocks (Competitor Mentions, Sentiment Heatmap, Talk Ratio) plus:

**NEW Block 4: Competitive Win/Loss Deep Dive**
- For each competitor detected, show: deals won against them, deals lost to them, active battles
- Per competitor: what objections appear most? What pain points do prospects mention when this competitor is present?
- Uses `meetings[].intelligence.competitiveIntel` (free-text field) — aggregate common themes
- Also mines `dealIntelligence.competitiveTimeline` for temporal patterns

**NEW Block 5: Competitive Positioning Insights**
- Aggregate `enrichment.competitivePositioning` across all enriched leads
- Aggregate `meetings[].intelligence.dealSignals.competitors` to build a frequency-weighted competitor list
- For each competitor: avg deal value of battles, stage at which they typically appear, win rate trend

#### Sub-tab 3: Risks (Loss Autopsy & Risk Radar)

**Relocates** `DashboardLossIntelligence` (all 6 blocks) here — removes it from Pipeline tab entirely. Plus:

**NEW Block 7: Active Deal Risk Radar**
- NOT just lost deals — shows risk signals on ACTIVE pipeline
- Aggregate `dealIntelligence.riskRegister` for all active leads
- Show: total unmitigated critical/high risks across active pipeline
- List top 10 unmitigated risks with the lead name, deal value, and severity
- Clickable to drill down — this is the "intervene NOW" view

**NEW Block 8: Momentum Decay Early Warning**
- For active deals, check `momentumSignals.momentum` — flag all "Stalling" or "Stalled"
- Cross-reference with `sentimentTrajectory` — show if sentiment is also declining
- Add: days since last meeting for each flagged deal
- Sort by deal value descending — highest value stalls first
- This is the "save these deals before they go dark" list

#### Sub-tab 4: Coaching

**Relocates** coaching metrics from Team tab (talk ratio, question quality, objection handling) and expands:

**Block 1: Rep Coaching Scorecard (expanded)**
- Per rep: avg talk ratio, question quality distribution (Strong/Adequate/Weak), objection handling distribution (Effective/Partial/Missed)
- Compare to portfolio averages and to won-deal averages
- Highlight specific gaps: "Malik's objection handling is 'Missed' 40% of the time vs. 15% portfolio average"

**Block 2: Talk Ratio Deep Dive**
- Relocate talk ratio correlation from CompetitiveRadar
- Add: talk ratio by stage (do reps talk more in early vs. late stages?)
- Add: talk ratio trend per rep over time (are they improving?)

**Block 3: Meeting Quality Trends**
- Per rep, per month: average engagement level of their meetings
- Are prospects more or less engaged over time?
- Correlate with deal outcomes: reps whose meetings trend toward "Highly Engaged" should have higher win rates

**Block 4: Questions & Discovery Quality**
- Aggregate `meetings[].intelligence.questionsAsked` — count and categorize
- Show: reps who ask more questions per meeting vs. fewer
- Cross-reference with outcomes

#### Sub-tab 5: GTM Insights

**Brand new section** — the marketing and go-to-market intelligence layer:

**Block 1: Buyer Language Map**
- Aggregate ALL `meetings[].intelligence.painPoints` and `meetings[].intelligence.keyTopics` across the entire portfolio
- Normalize and group into themes with frequency
- Show which themes lead to won deals — "these are the words your buyers use, put them in your marketing"

**Block 2: Value Proposition Effectiveness**
- Aggregate `meetings[].intelligence.valueProposition` across all meetings
- Group similar value props, count frequency, correlate with outcomes
- Shows: "When we lead with X value prop, we win Y% of the time"

**Block 3: Urgency Driver Map**
- Aggregate `meetings[].intelligence.dealSignals.urgencyDrivers` across all leads
- Show which urgency drivers appear in won vs. lost deals
- Tells sales: "When a prospect mentions [trigger], prioritize — it closes"

**Block 4: Channel → Intelligence Correlation**
- Cross-reference lead `source` with intelligence richness: which channels produce leads that generate the most meetings, the deepest intelligence, and the best outcomes?
- Shows: "CT Contact Form leads have 2.3x more meetings and 40% higher win rate than CT Targets Form"

**Block 5: ICP Validation from Conversations**
- Aggregate `enrichment.acquisitionCriteria`, `enrichment.buyerMotivation`, and `enrichment.urgency` across enriched leads
- Cross-reference ICP fit (Strong/Moderate/Weak) with actual conversation signals
- Are "Strong ICP" leads actually expressing stronger buying signals? If not, the ICP model needs recalibration

### 3. Dashboard & Pipeline Tab Cleanup

Remove relocated components from their current locations:
- **Overview tab**: Remove `DashboardSignalIntelligence` (now in Intel → Signals)
- **Pipeline tab**: Remove `DashboardLossIntelligence` and `DashboardCompetitiveRadar` (now in Intel → Risks and Intel → Competitors)
- **Team tab**: Keep basic rep scorecard but remove coaching deep-dive (now in Intel → Coaching). Add a link/badge: "Deep coaching analysis →" that switches to Intel tab.

This makes Dashboard and Pipeline tabs focused on **metrics and operational status**, while Intel tab is focused on **why things are happening and what to do about it**.

### 4. Navigation Update

Update `Index.tsx` NAV_ITEMS:
```
Dashboard → Pipeline → Intel → Leads → Today
```

Update `CommandPalette.tsx` to include Intel tab and sub-tab navigation shortcuts.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/IntelligenceCenter.tsx` | **New** — Full intelligence command center with 5 sub-tabs |
| `src/pages/Index.tsx` | Add "Intel" as 5th top-level tab, update NAV_ITEMS |
| `src/components/CommandPalette.tsx` | Add Intel tab + sub-tab navigation |
| `src/components/Dashboard.tsx` | Remove `DashboardSignalIntelligence` from Overview tab |
| `src/components/Dashboard.tsx` | Remove `DashboardLossIntelligence` and `DashboardCompetitiveRadar` from Pipeline tab |

Existing components (`DashboardSignalIntelligence`, `DashboardCompetitiveRadar`, `DashboardLossIntelligence`) are reused inside `IntelligenceCenter.tsx` — no rewrite needed for those. New blocks are added alongside them within the sub-tab layout.

No new API calls, no schema changes. All data is already on lead objects.

