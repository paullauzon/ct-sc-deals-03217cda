

# Enhanced Loss & Competitive Intelligence

## The Insight

The current Loss Intelligence section relies on shallow CRM fields (`closeReason`, `lostReason`) which are often just "Budget" or "No Response" — a salesperson's best guess in 2 seconds. But we have **deep intelligence** sitting unused on these same leads:

- **Meeting Intelligence**: `painPoints`, `dealSignals` (buying intent, sentiment, objections, risk factors, competitors), `engagementLevel`, `talkRatio`, `questionQuality`
- **Deal Intelligence**: `dealNarrative`, `stakeholderMap` (with stances like Blocker/Skeptic), `riskRegister`, `momentumSignals`, `psychologicalProfile`, `powerDynamics`, `winStrategy`
- **Enrichment**: `companyDescription`, `buyerMotivation`, `urgency`, `competitiveLandscape`
- **Action Items**: dropped/overdue items that were never completed

The plan: synthesize ALL of this into a **true loss autopsy** that surfaces what actually killed deals, not what the rep typed.

## What Changes

Replace the current 4-block layout with a **6-block intelligence-driven layout**:

```text
┌─────────────────────────┬──────────────────────────┐
│ 1. Synthesized Loss     │ 2. Deal Autopsy Cards    │
│    Reasons (AI-derived) │    (per-lead deep view)  │
├─────────────────────────┼──────────────────────────┤
│ 3. Engagement Decay     │ 4. Risk Factor           │
│    Signals              │    Frequency Map         │
├─────────────────────────┼──────────────────────────┤
│ 5. Dropped Ball         │ 6. Re-engagement         │
│    Tracker              │    Opportunities         │
└─────────────────────────┴──────────────────────────┘
```

### Block 1: Synthesized Loss Reasons (replaces current Loss Patterns)

Instead of just counting `closeReason` values, synthesize a "true reason" for each lost deal by mining:
- `closeReason` / `lostReason` (rep's stated reason — baseline)
- `dealIntelligence.riskRegister` — unmitigated Critical/High risks
- `dealIntelligence.objectionTracker` — recurring/open objections at time of loss
- `dealIntelligence.momentumSignals.momentum` — was it "Stalling"/"Stalled"?
- `dealIntelligence.stakeholderMap` — any Blockers with unaddressed concerns?
- `dealIntelligence.psychologicalProfile.fearFactor` — psychological barriers
- Meeting intelligence `dealSignals.sentiment` trajectory — did sentiment decline?
- `dealSignals.competitors` — were competitors mentioned?

For each lost lead, derive a **composite loss category** from a priority hierarchy:
1. Competitor displacement (competitors mentioned + lost)
2. Blocker/champion issues (blocker in stakeholder map, champion left)
3. Stalled momentum (momentum signals show Stalling/Stalled + no meeting activity)
4. Unresolved objections (recurring objections never addressed)
5. Risk materialization (critical risks that were unmitigated)
6. Engagement decay (sentiment went negative, engagement dropped)
7. Rep-stated reason (fallback to `closeReason`)

Display as the same bar chart but with these richer categories. Each bar is clickable for drill-down.

### Block 2: Deal Autopsy Cards (NEW — replaces nothing, adds depth)

For lost deals that HAVE meeting intelligence or deal intelligence, show a compact "autopsy card" — the top 3-5 lost deals by value, each showing:
- Lead name, company, deal value, days in pipeline
- **Rep's reason** vs **Synthesized reason** (side by side — highlights discrepancy)
- Last known sentiment + engagement level
- Key unresolved objection or risk
- Blocker name if one existed

Clickable to open the lead. This is the "FBI case file" view — what actually happened.

### Block 3: Engagement Decay Signals (replaces Time-to-Dark)

Upgrade from simple "days to dark" buckets to a richer view:
- Keep the time buckets but add columns for: **last sentiment**, **last engagement level**, **momentum at loss**
- Add a summary row: "X% of dark leads showed declining engagement before going dark" (from `engagementTrajectory`)
- Add: "Average meetings before going dark: X" and "% that had a Stalled momentum signal"

This answers: "Could we have seen it coming?"

### Block 4: Risk Factor Frequency Map (replaces Objection Frequency)

Broaden from just objections to ALL risk signals across lost deals:
- Aggregate `riskRegister` entries from deal intelligence (risk text, severity, mitigation status)
- Aggregate `dealSignals.riskFactors` from meeting intelligence
- Aggregate `dealSignals.objections` from meeting intelligence
- Combine with `objectionTracker` 

Show top 12 risk/objection themes with:
- Frequency count
- % that were mitigated vs unmitigated
- Correlation: when mitigated, what % still lost? (shows which risks are fatal vs manageable)

### Block 5: Dropped Ball Tracker (NEW)

Aggregate `actionItemTracker` from deal intelligence across ALL lost deals. Filter for items with status "Dropped" or "Overdue". Group by owner. Shows:
- Which action items were never completed before the deal died
- Who dropped the ball most often
- Pattern: "Follow-up proposal" dropped 4 times across lost deals = systematic failure

This is the accountability view — surfaces process failures, not just prospect issues.

### Block 6: Re-engagement Opportunities (KEPT, enhanced)

Keep current logic but add:
- Show the synthesized loss reason next to each candidate
- Add a "re-engage angle" — if the original issue was timing/budget, and it's been 60+ days, flag as "Timing may have shifted"
- Sort by a composite score: ICP fit weight + deal value + recency

## Implementation

### Modified: `src/components/DashboardLossIntelligence.tsx`

Complete rewrite of the component internals. Same props interface (`leads`, `onDrillDown`). Six blocks in a 2x3 grid.

New helper functions:
- `synthesizeLossReason(lead)` — examines all intelligence sources, returns a composite category
- `buildAutopsyCard(lead)` — extracts key signals for the autopsy view
- `aggregateRiskSignals(leads)` — combines risk register + objection tracker + meeting deal signals

### No other files changed

Dashboard.tsx already renders `<DashboardLossIntelligence>` in the Pipeline tab. No integration changes needed.

## Technical Details

All computation is client-side in `useMemo` hooks — no new API calls, no new edge functions. We're mining data that already exists on each lead's `meetings[].intelligence`, `dealIntelligence`, and `enrichment` objects. The synthesized loss reason is deterministic (priority hierarchy, not AI inference), so it's fast and predictable.

