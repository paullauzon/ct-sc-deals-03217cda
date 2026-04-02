

# Command Center — Comprehensive Final Audit

## Current State (Verified via Code + Screenshots)

All 4 tabs render cleanly with zero runtime errors. All three AI edge functions already upgraded to gpt-4o. PrepIntelTab correctly passes full lead data (meetings, leadFields, dealIntelligence) to generate-meeting-prep. PrepBriefSheet displays structured results. Follow-Ups has rich rows, snooze buttons with toast, sort controls, AI action chips, "Copy & Mark Done", unanswered inbound detection. Deal Pulse has KPIs with benchmark label, forecast strip, momentum board with sort, velocity cards. Schedule has morning briefing, meeting cards, today-only priority tiers.

## What's Actually Still Remaining

### 1. Follow-Ups Badge Shows "99+" — Overwhelming and Unhelpful
The Follow-Ups tab badge shows "99+" (77 overdue + 10 untouched + 6 going dark = 93+ items). This makes the badge meaningless — a veteran needs to know "how many urgent items need my attention TODAY" not a total backlog count.

**Fix**: Change the badge to show only overdue count (77), or better — only items overdue by 7 days or fewer (actionable backlog, not ancient history). The ActionQueue component computes the badge at line ~75 of ActionQueue.tsx.

### 2. Follow-Ups: No "Unanswered Inbound" Count in Summary Strip  
The summary strip shows "77 Overdue · 5 Due This Week · 10 Untouched · 6 Going Dark" but the Unanswered Inbound section count (from async email query) isn't reflected until the section renders below. A veteran scanning the strip gets no heads-up about pending replies.

**Fix**: Add unanswered count to the summary strip once the email query resolves.

### 3. Schedule Tab: Horizon Toggle Shows for Schedule but Serves No Purpose
The 7d/14d/30d horizon toggle appears on the Schedule tab, but the Schedule tab already separates meetings into "This Week", "Next Week", "Later" groupings and the priority tiers are already limited to today. The horizon toggle only meaningfully affects Prep Intel (which meetings to show cards for). On Schedule, it changes the meeting count but the visual grouping already handles this.

**Fix**: This is cosmetic — the horizon toggle works correctly for both tabs. No action needed.

### 4. Prep Intel: Cards for Leads Without Meetings Show "Generate Prep Brief" — Will Fail
All three Prep Intel cards (Cody Mauri, john lindsey, Nicholas Santoro) are "Meeting Set" with 0 prior meetings and 0 emails. Clicking "Generate Prep Brief" will pass an empty `meetings: []` array, which the edge function rejects with "No meetings to prepare from". The error handling works (it shows the toast), but the button is misleading for leads with no meeting history.

**Fix**: Change button text to "Generate Pre-Meeting Research" for leads with 0 meetings, and add a note that the brief will be richer after the first meeting. Or — conditionally show a different action for leads without meetings (e.g., "Research Prospect" using the enrich-lead function instead).

### 5. Prep Intel: No Quick Action Buttons Beyond "Generate Prep Brief"
For a veteran prepping for a meeting, the card should enable immediate action: "Draft Pre-Meeting Email" (using generate-follow-up-action with type "initial-outreach" or "prep-brief"), or "Open Deal Room" for deep dive. Currently the only action is Generate Prep Brief which fails without meeting data.

**Fix**: Add a "Draft Pre-Meeting Email" button for leads with meetingCount === 0 (leveraging the existing AI action sheet), and keep "Generate Prep Brief" for leads with meeting history.

### 6. Deal Pulse: 109 Active Deals Includes "Contacted" and "Qualified" — Too Broad
The "Active Deals" KPI shows 109 because it includes every non-closed stage including "Qualified" (leads that may have just been tagged). A veteran cares about deals in active motion (Meeting Set through Contract Sent). "Qualified" and "Contacted" are pre-pipeline.

**Fix**: Consider filtering the momentum board to only show stages from "Meeting Set" onward, or add a stage filter toggle. The KPI can stay at 109 (total active) but the momentum board should default to later stages.

### 7. Deal Pulse: Most Deals Show "—" for Temp, Momentum, Value
The majority of the momentum board rows show "—" for Temperature, Momentum, and Value columns. This is expected (no deal intelligence synthesized yet), but the visual is noisy. 109 rows with mostly blank data makes the board hard to scan.

**Fix**: Add a "Has Intel" filter toggle to the momentum board so veterans can focus on deals with actual intelligence data. Default to showing all, but one click to filter to only deals with deal intelligence.

### 8. Follow-Ups: Overdue Section Shows 77 Items — No Pagination or Batch Actions
77 overdue items renders a very long list. A veteran needs batch operations: "Snooze all 30+ day overdue to next week" or "Mark all untouched as Low priority". Individual snooze buttons exist but no batch capability.

**Fix**: Add a batch action bar at the top of the Overdue section: "Snooze all >30d overdue" and "Snooze all >14d overdue" buttons that bulk-update nextFollowUp.

### 9. Schedule Tab: Empty "At Risk" and "Monitor" Tiers Still Render Headers
When the at-risk and monitor tiers have 0 items (because the filter excludes dark/untouched/stale from Schedule), the tier sections don't render (the TierSection component returns null for 0 items). This is correct — no fix needed.

---

## Priority Implementation Order

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Change Prep Intel button to "Research Prospect" for leads without meetings | `PrepIntelTab.tsx` | UX — prevents misleading CTA |
| 2 | Add "Draft Pre-Meeting Email" action to Prep Intel cards | `PrepIntelTab.tsx` | Feature gap — actionable prep |
| 3 | Add batch snooze to Follow-Ups overdue section | `FollowUpsTab.tsx` | Workflow — 77 items is unmanageable |
| 4 | Add "Has Intel" filter to Deal Pulse momentum board | `DealPulseTab.tsx` | UX — 109 mostly-blank rows |
| 5 | Reduce Follow-Ups badge to actionable count | `ActionQueue.tsx` | UX polish |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Change "Generate Prep Brief" to "Research Prospect" for 0-meeting leads; add "Draft Pre-Meeting Email" button opening AI action sheet |
| `src/components/command-center/FollowUpsTab.tsx` | Add batch snooze bar for overdue section (snooze all >14d, >30d) |
| `src/components/command-center/DealPulseTab.tsx` | Add "Has Intel" toggle to momentum board header |
| `src/components/ActionQueue.tsx` | Cap Follow-Ups badge at overdue-only count instead of total |

