

# Mega Strategy: Turning Intelligence Into Rep Enablement

## The Core Problem

Right now, your system has two worlds that don't talk to each other:

1. **COO World** (Dashboard): Aggregated intelligence across all deals — pricing corridors, urgency taxonomies, coaching scorecards, competitive displacement playbooks, stakeholder risk heatmaps. This is where the *patterns* live.

2. **Rep World** (Command Center + Pipeline + Deal Room): Individual deal context — prep briefs, follow-up sequences, deal intelligence panels, action sheets. This is where the *execution* happens.

The gap: your reps can't benefit from the patterns. Malik doesn't know that "Strong intent + Steady momentum for 14+ days" is a red flag across 60 deals. He just sees his 8 deals individually. The COO intelligence stays on the COO dashboard. The reps never see it.

---

## What to Build (Prioritized by Revenue Impact)

### Tier 1: Close Revenue That's Already There

**1. "Why You'll Win / Why You'll Lose" Card — per deal, in real time**

Where: Pipeline card hover, Deal Room sidebar, Follow-Ups row expansion
What: For each active deal, synthesize a 2-line card from existing deal intelligence:
- **Win because**: Pull from `winStrategy.numberOneCloser` + `stakeholderMap` champion presence + `momentumSignals.momentum`
- **Lose because**: Pull from `riskRegister` unmitigated items + `objectionTracker` open objections + missing champion flag
- **Do next**: The single highest-leverage action from `actionItemTracker` (oldest open item) or `winStrategy.powerMove`

Data source: `deal_intelligence.winStrategy`, `deal_intelligence.riskRegister`, `deal_intelligence.stakeholderMap`, `deal_intelligence.actionItemTracker`
Coverage: 83-85 deals — everything with a meeting.

This replaces "a rep needs to click into Deal Room → Intelligence tab → read 5 sections → synthesize mentally" with a 2-second glance.

**2. "Dropped Promise" Alerts — inline in Follow-Ups and Schedule**

Where: FollowUpsTab rows, ScheduleTab items, Pipeline card badges
What: When a deal has open action items from `deal_intelligence.actionItemTracker` with status "Open" or "Overdue," surface the specific promise directly in the follow-up row. Not just "Complete Actions" — show *what* was promised: "Send case study (14d overdue)," "Share pricing proposal (7d overdue)."

Currently: `getRecommendation()` in FollowUpsTab checks for open action items but only shows the first one generically. The Schedule tab doesn't check at all. Pipeline cards don't show dropped promises.

The 5.9% action item completion rate means 131 promises are invisible. Making them visible in the rep's daily workflow is the single highest-ROI change.

**3. "Similar Deals Won" Pattern Match — per deal**

Where: Prep Intel battle cards, Deal Room sidebar
What: When a rep is prepping for a meeting, show "3 deals with similar profile closed at $X/mo in Y days." Match on: same brand, similar deal value range (within 30%), same service interest, same ICP fit. Show what tactics worked (from those deals' `winStrategy.numberOneCloser`).

Data: Cross-reference current deal attributes against the 6 won deals (4 Captarget, 2+ SourceCo eventually). As more deals close, this becomes increasingly powerful. Even with 4 won deals, showing "Alexander Kurian had similar objections and closed at $7K/mo after demonstrating ROI" is actionable.

**4. Pricing Guidance — per deal, context-aware**

Where: Prep Intel battle cards (before meetings), Follow-Up action sheet (when drafting proposals)
What: When a rep is about to discuss pricing, show:
- This prospect's stated budget (from `meetings[].intelligence.dealSignals.budgetMentioned`)
- Won deal pricing corridor for this brand (from aggregated pricing intelligence)
- What value props resonated in deals at this price point (from `ValuePropEffectiveness` data)

Currently: Pricing data exists in 123 meetings but is only visible on the COO Economics tab. The rep going into a pricing conversation has zero guidance from the system.

### Tier 2: Prevent Revenue Loss

**5. "Deal Health Score" — composite, visual, per deal**

Where: Pipeline cards (replacing or supplementing the current aging heatmap), Deal Pulse tab, Follow-Ups rows
What: A single 0-100 score computed from:
- Champion presence (stakeholder map has at least 1 Champion = +25, none = -25)
- Action item completion rate for this deal (+/- 25)
- Momentum signal (Accelerating = +20, Steady = 0, Stalling = -20)
- Days in stage vs. average for won deals at this stage (+/- 15)
- Open unmitigated critical risks (-15 per)

Currently: Deal Pulse shows momentum + temperature separately. The rep has to mentally combine 5 signals. A single score with color coding (green/amber/red) makes triage instant.

**6. "Stakeholder Coverage" Warning — per deal**

Where: Pipeline cards, Deal Room header, Prep Intel
What: Flag deals where:
- No champion identified (16 deals currently)
- Decision maker is "Neutral" (highest risk pattern from stakeholder analysis)
- Only 1 stakeholder mapped (single-threaded = fragile)

Show as a badge: "No Champion" (red), "Single-threaded" (amber), "Multi-threaded" (green).

Data: `deal_intelligence.stakeholderMap` — 195 stakeholders across 85 deals.

**7. "Objection Playbook" — context-aware per deal**

Where: Prep Intel battle cards, inline in Follow-Ups when objection is detected
What: When a deal has open objections (from `deal_intelligence.objectionTracker`), show the rep how similar objections were handled in won deals. Pull from the aggregated objection data:
- "Budget/Pricing" objection → "In 3 won deals, this was addressed by leading with ROI and offering quarterly billing"
- "Past vendor failure" → "In 2 won deals, case studies and a pilot program closed the trust gap"

Currently: Objections are tracked per-deal in the Deal Intelligence panel, and aggregated on the Forecast tab heatmap. But there's no connection: when a rep faces a pricing objection, the system doesn't tell them what worked before.

### Tier 3: Accelerate and Optimize

**8. "Next Best Action" Engine — replacing generic playbooks**

Where: Schedule tab, Follow-Ups tab, Pipeline card action chips
What: Instead of static playbook sequences (send confirmation → send agenda → follow up), dynamically compute the next best action based on deal state:
- If momentum is "Stalling" and last contact > 7 days → "Re-engage with case study"
- If sentiment was "Neutral" in last meeting and no follow-up sent → "Send value-add (urgent)"
- If proposal sent > 5 days ago and no response → "Direct ask about timeline"
- If they have open action items they owe us → "Nudge on [specific item]"

Currently: The playbook system (`src/lib/playbooks.ts`) is stage-based with fixed day offsets. It doesn't account for deal intelligence. A "Meeting Held" deal gets the same sequence whether it's "On Fire" or "Cold."

Data: Combine `deal_intelligence.momentumSignals`, latest `meetings[].intelligence.dealSignals`, `deal_intelligence.actionItemTracker`, stage duration, and last contact date.

**9. "Morning Briefing" — daily digest per rep**

Where: Schedule tab header (already has "Since Yesterday" strip)
What: Expand the briefing strip to include:
- Deals where momentum changed (Steady → Stalling, or Accelerating)
- Action items that became overdue overnight
- Deals hitting the "meeting count sweet spot" threshold (3+ meetings, no stage advance)
- Any deal where a competitor was mentioned for the first time

Currently: "Since Yesterday" shows new leads, Calendly bookings, and stage changes. It doesn't surface intelligence changes.

**10. "Win/Loss Debrief" Auto-Insights — when a deal closes**

Where: Deal Room (for closed deals), Follow-Ups tab (as a learning moment)
What: When a deal is marked Closed Won or Closed Lost, auto-generate a debrief:
- What signals predicted this outcome (from Signal-to-Close Matrix data)
- What the rep did well (from coaching metrics for this deal's meetings)
- What could improve (dropped action items, weak objection handling, single-threading)
- How this compares to the average won/lost deal

Data: All transcript intelligence + deal intelligence for the specific lead, cross-referenced with aggregate patterns.

---

## How These Connect to the Transcript Intelligence Plan

| Transcript Intelligence (COO Dashboard) | Rep Enablement (Command Center) |
|---|---|
| Action Item Completion Tracker (5.9% crisis) | → Dropped Promise Alerts inline in Follow-Ups (#2) |
| Pricing Intelligence corridors | → Pricing Guidance per deal before meetings (#4) |
| Signal-to-Close Matrix | → Deal Health Score composite (#5) |
| Stakeholder Risk Heatmap | → Stakeholder Coverage Warning badges (#6) |
| Objection & Competitor Heatmap | → Objection Playbook per deal (#7) |
| Urgency Driver Taxonomy | → Opening hooks in Prep Intel already use this |
| Value Prop Effectiveness | → Similar Deals Won pattern matching (#3) |
| Deal Temperature & Momentum | → Next Best Action engine (#8) |
| Win Strategy Intelligence | → Win/Lose card per deal (#1) |
| Meeting Count vs Outcome | → Morning Briefing threshold alerts (#9) |

The pattern: every COO-level insight becomes a rep-level action.

---

## What NOT to Build (and Why)

- **Automated email sending**: You want human judgment in the loop. AI drafts + one-click copy is the right model (already implemented).
- **Lead scoring visible to reps**: Tier/score is a prioritization tool for management, not a rep motivator. Showing "this lead is Tier 3" to a rep creates self-fulfilling prophecy.
- **Full competitive intelligence per deal**: The Prep Intel battle cards already surface competitive positioning. Adding more would create information overload.
- **Real-time notifications/push alerts**: Without a mobile app or email integration, in-app alerts only work when the rep is already looking at the CRM. The morning briefing + follow-up prioritization handles this better.

---

## Implementation Priority (by effort vs impact)

| # | Feature | Impact | Effort | Files |
|---|---------|--------|--------|-------|
| 1 | Win/Lose card per deal | Very High | Low | Pipeline.tsx, DealRoom.tsx, FollowUpsTab.tsx |
| 2 | Dropped Promise Alerts | Very High | Low | FollowUpsTab.tsx, ScheduleTab.tsx, Pipeline.tsx |
| 3 | Deal Health Score | High | Medium | New utility + Pipeline.tsx, DealPulseTab.tsx |
| 4 | Stakeholder Coverage Warning | High | Low | Pipeline.tsx, DealRoom.tsx |
| 5 | Pricing Guidance in Prep Intel | High | Medium | PrepIntelTab.tsx |
| 6 | Objection Playbook | Medium | Medium | PrepIntelTab.tsx, FollowUpsTab.tsx |
| 7 | Next Best Action engine | High | High | New utility + playbooks.ts + ScheduleTab.tsx + FollowUpsTab.tsx |
| 8 | Similar Deals Won | Medium | Medium | PrepIntelTab.tsx, DealRoom.tsx |
| 9 | Enhanced Morning Briefing | Medium | Low | ScheduleTab.tsx |
| 10 | Win/Loss Debrief | Low (rare event) | Medium | DealRoom.tsx |

All use existing data. No new database tables, no new API calls, no fabricated metrics. Pure intelligence surfacing.

