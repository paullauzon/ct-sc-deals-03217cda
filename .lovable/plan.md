

# Next-Level Sales System: What a $500M ARR Leader Still Demands

After auditing everything that's built — Today queue, Pipeline filters, Dashboard analytics, Lead Detail with Deal Intelligence, Activity Timeline, Bulk Actions — here's what's still missing for the personas described.

---

## Category A: "Command Center" Upgrades (Highest Impact)

### 1. Deal Room — Dedicated Full-Page View Per Deal
**Problem**: The lead detail is a side-sheet. For a $200K deal with 6 meetings, stakeholder maps, risks, and action items, a slide-over panel isn't enough. A veteran wants to *live* inside a deal.

**What to build**: A `/deal/:id` full-page view with:
- Left column: Deal vitals (stage, value, owner, contract dates) + Deal Progress
- Center: Tabbed workspace (Timeline | Meetings | Intelligence | Prep Brief | Emails | Notes)
- Right sidebar: Stakeholder map, risk register, action items — always visible
- Top: Deal health score bar + momentum indicator + days in stage

This is the "war room" for every active deal.

### 2. Pipeline Snapshots / Period Comparison
**Problem**: Dashboard shows current state. A $500M ARR leader asks: "How does this month's pipeline compare to last month? Are we building or burning?" There's no time-based comparison.

**What to build**: A "Pipeline Snapshot" section on the dashboard:
- Store a weekly snapshot of pipeline state (stage counts + values) in a `pipeline_snapshots` table
- Show a comparison: this week vs. last week vs. 4 weeks ago
- Highlight: new deals added, deals advanced, deals lost, net pipeline change
- A simple sparkline of weighted pipeline value over the last 12 weeks

### 3. Forecast Roll-Up with Commit Tracking
**Problem**: Forecast categories exist (Commit/Best Case/Pipeline/Omit) but there's no target to measure against. A leader needs: "We need $500K this quarter. We have $380K in Commit. Gap = $120K."

**What to build**:
- A configurable quarterly target (stored in localStorage or a simple `settings` table)
- Forecast view: Target vs. Commit vs. Best Case vs. Pipeline with a visual gap analysis bar
- "Coverage ratio" = (Commit + Best Case) / Target — anything under 2x is dangerous

---

## Category B: Team Accountability & Coaching (High Impact)

### 4. Rep Leaderboard with Trend Lines
**Problem**: Rep Scorecard shows current state but no trends. A sales leader wants to see: "Is Malik improving or plateauing?"

**What to build**: Extend DashboardAdvancedMetrics:
- Win rate trend by rep (last 4 periods)
- Activity score per rep: (follow-ups completed + meetings held + notes added) / week
- "Deals touched this week" count per rep — is anyone neglecting their book?

### 5. Coaching Insights — Aggregated from Meeting Intelligence
**Problem**: Talk ratio and question quality exist per-meeting but aren't surfaced for coaching. A leader wants: "Malik talks 70% of the time — he needs to listen more."

**What to build**: A "Coaching" section on Dashboard:
- Per-rep: avg talk ratio, question quality distribution, objection handling effectiveness
- Flag: reps with talk ratio >60% or weak question quality on >50% of meetings
- Clickable to drill into specific meetings

---

## Category C: Operational Efficiency (Medium Impact)

### 6. Keyboard Shortcuts / Command Palette
**Problem**: A power user managing 50+ deals shouldn't be clicking through menus. They need `Cmd+K` to search, jump to any lead, switch views.

**What to build**: A command palette (using existing `cmdk` package already installed):
- `Cmd+K` opens search → type lead name → Enter opens detail
- Commands: "Go to Pipeline", "Go to Dashboard", "Show overdue", "Filter by High priority"
- Recent leads list

### 7. Deal Aging Heatmap on Pipeline
**Problem**: Pipeline cards show days in stage as text. A veteran wants to *see* risk at a glance — a card that's been sitting for 30 days should visually scream.

**What to build**: Color-code pipeline card borders/backgrounds based on days in stage:
- <7d: no highlight (fresh)
- 7-14d: subtle yellow border
- 14-21d: orange border
- 21d+: red border with pulse
- This makes stale deals impossible to miss without reading any text

### 8. Follow-Up Scheduling from Pipeline Card
**Problem**: Quick-note exists on pipeline cards, but you can't set a follow-up date without opening the lead detail. After a call, you want to log a note AND schedule the next touch.

**What to build**: Extend the QuickNote popover to include a "Next Follow-up" date picker. One popover, two actions: note + schedule.

---

## Category D: Strategic Intelligence (Medium Impact)

### 9. "At Risk" Revenue Dashboard Widget
**Problem**: The system knows momentum (Stalling/Stalled), unmitigated risks, overdue items — but doesn't aggregate the dollar value at risk.

**What to build**: A dashboard card:
- "Revenue at Risk: $X" — sum of dealValue for leads with momentum=Stalling/Stalled OR critical unmitigated risks OR >21d no contact
- Clickable: opens filtered list of those deals
- Compare against total pipeline to show risk percentage

### 10. Stage Conversion Rates (Funnel Drop-Off)
**Problem**: Funnel exists but doesn't show WHERE deals die. A leader needs: "40% of deals die between Meeting Held and Proposal Sent — why?"

**What to build**: Calculate stage-to-stage conversion rates:
- For each stage transition (New Lead→Qualified, Qualified→Contacted, etc.), compute: what % of deals that entered stage N made it to stage N+1?
- Display as a funnel with conversion percentages between each step
- Highlight the weakest link

---

## Implementation Priority

| # | Feature | DB Change? | Complexity | Impact |
|---|---------|-----------|------------|--------|
| 1 | Deal Aging Heatmap | No | Low | High — instant visual intelligence |
| 2 | Command Palette (Cmd+K) | No | Medium | High — power user productivity |
| 3 | Follow-Up from Pipeline Card | No | Low | Medium — workflow efficiency |
| 4 | At Risk Revenue Widget | No | Low | High — revenue protection |
| 5 | Stage Conversion Funnel | No | Medium | High — strategic insight |
| 6 | Forecast Roll-Up + Gap | No (localStorage) | Medium | High — revenue planning |
| 7 | Coaching Insights Section | No | Medium | High — team development |
| 8 | Rep Leaderboard Trends | No | Medium | Medium — accountability |
| 9 | Pipeline Snapshots | Yes (`pipeline_snapshots`) | High | High — trend analysis |
| 10 | Deal Room Full Page | No | High | Very High — deal management |

**Recommended batch**: Items 1-6 first (zero DB changes, all computed from existing data). Then 7-8 (coaching/trends). Items 9-10 are larger architectural additions.

