

# Phase 6: Intelligence-Driven Dashboard Enrichment

## The Opportunity

We have rich intelligence sitting on leads — meeting transcripts processed into structured `dealSignals`, `painPoints`, `stakeholderMap`, `objectionTracker`, `enrichment` data, and `psychologicalProfile` — but the dashboard only uses this data in narrow contexts (Loss Intelligence, Deal Health alerts). None of the **positive signal intelligence** is surfaced at the aggregate level.

A 50-year sales veteran doesn't just look at what's failing. They look at **what's working and why**, **what buyers are actually saying**, and **where the opening is right now**. Here's what we can build using only data that already exists on each lead.

---

## New Components

### 1. `DashboardSignalIntelligence.tsx` — Overview Tab

An "Intelligence Briefing" section after Trend Analytics. Four blocks in a 2x2 grid:

**Block 1: Buying Intent Radar**
Aggregate `meetings[].intelligence.dealSignals.buyingIntent` across all active pipeline leads. Show distribution: Strong / Moderate / Low / None detected. Cross-reference with deal value to answer: "How much pipeline has strong buying signals?" The number that matters is `$X in Strong Intent pipeline` — that's the real forecast.

**Block 2: Pain Point Frequency Map**
Aggregate `meetings[].intelligence.painPoints` across ALL leads (not just lost ones). Normalize and group similar themes. Show top 8 pain points with: frequency count, % that converted to won, avg deal value. This tells you: "What problems do our best customers have? Double down on these in marketing."

**Block 3: Objection Readiness Score**
Aggregate `dealIntelligence.objectionTracker` across active deals. Show: total open objections, total addressed, resolution rate. Then show the top 5 most common objections with win/loss correlation. Answers: "Which objections are we handling well, and which are deal-killers?"

**Block 4: Stakeholder Power Map (Aggregate)**
Aggregate `dealIntelligence.stakeholderMap` across active pipeline. Count: Champions, Supporters, Neutral, Skeptics, Blockers. Show total pipeline value controlled by each stance category. Answers: "How much of our pipeline has a champion vs. a blocker?" — the single most predictive deal signal.

### 2. `DashboardCompetitiveRadar.tsx` — Pipeline Tab

A "Competitive Intelligence" section after Loss Intelligence. Three blocks:

**Block 1: Competitor Mentions Tracker**
Aggregate `meetings[].intelligence.dealSignals.competitors` across all leads. Count frequency of each competitor name. Show which competitors appear in active deals vs. closed-lost deals. Answers: "Who are we running into most, and are we winning against them?"

**Block 2: Sentiment & Engagement Heatmap**
For each active deal, extract last meeting's `sentiment` and `engagementLevel`. Plot as a compact matrix: rows = leads (top 15 by value), columns = last 3 meetings sentiment trajectory. Color-coded. Answers: "Which deals are trending positive vs. cooling off?" — a leading indicator dashboard.

**Block 3: Talk Ratio vs. Outcome Correlation**
Aggregate `meetings[].intelligence.talkRatio` and cross-reference with deal outcomes. Show: avg talk ratio for won deals vs. lost deals. If there's a clear pattern (e.g., won deals have <40% talk ratio), surface it as an insight. This is the coaching feedback loop at the portfolio level.

### 3. Enhancements to Existing Sections

**Overview Tab — Deal Health Enhancement:**
Add a "Champion Coverage" metric to the existing Deal Health block. Count how many active deals have at least one "Champion" in their `stakeholderMap`. Show as "X of Y deals have a champion" with the unchampioned pipeline value highlighted as risk.

**Team Tab — Coaching Enhancement:**
In `DashboardAdvancedMetrics` team section, add a row showing each rep's avg `questionQuality` and `objectionHandling` ratings from their meeting intelligence. Currently only `talkRatio` is shown. The data is already there in `meetings[].intelligence`.

---

## Implementation Details

### `src/components/DashboardSignalIntelligence.tsx` (NEW)
- Props: `leads: Lead[]`, `onDrillDown`
- 4 blocks, 2x2 grid
- All computation in `useMemo` — mines `meetings[].intelligence` and `dealIntelligence`
- Clickable intent categories and pain points for drill-down

### `src/components/DashboardCompetitiveRadar.tsx` (NEW)
- Props: `leads: Lead[]`, `onDrillDown`, `onSelectLead`
- 3 blocks in the Pipeline tab
- Sentiment heatmap uses simple colored dots (no external charting library needed)

### `src/components/Dashboard.tsx` (MODIFIED)
- Import and render `DashboardSignalIntelligence` in Overview tab after `DashboardTrends`
- Import and render `DashboardCompetitiveRadar` in Pipeline tab after `DashboardLossIntelligence`
- Add champion coverage metric to the existing Deal Health block

### `src/components/DashboardAdvancedMetrics.tsx` (MODIFIED)
- In team section coaching block, add `questionQuality` and `objectionHandling` aggregates per rep

---

## What This Unlocks

| Current State | After Phase 6 |
|---|---|
| Dashboard shows pipeline in dollars | Dashboard shows pipeline by **buying intent strength** |
| Pain points only visible per-lead | Aggregate pain point map shows **what messaging works** |
| Objections only in Loss Intelligence | Active deal objection readiness shows **where to intervene now** |
| Stakeholder data buried in deal rooms | Aggregate champion coverage shows **pipeline quality** |
| Competitor data invisible at portfolio level | Competitive radar shows **who we're fighting and winning against** |
| Sentiment only per-meeting | Sentiment trajectory heatmap shows **deals trending cold before they go dark** |
| Coaching only shows talk ratio | Full coaching scorecard with question quality and objection handling |

## Files Changed

| File | Change |
|------|--------|
| `src/components/DashboardSignalIntelligence.tsx` | **New** — 4 intelligence blocks for Overview |
| `src/components/DashboardCompetitiveRadar.tsx` | **New** — 3 competitive/sentiment blocks for Pipeline |
| `src/components/Dashboard.tsx` | Import + render new components, add champion coverage to Deal Health |
| `src/components/DashboardAdvancedMetrics.tsx` | Add question quality + objection handling to Team coaching |

No new API calls, no new edge functions, no schema changes. All data already exists on lead objects.

