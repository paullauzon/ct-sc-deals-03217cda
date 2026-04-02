

# Upgrade Command Center to Elite Sales Cockpit

## What's Already Strong
The 4-tab structure is solid. Schedule, Follow-Ups, Deal Pulse, and Prep Intel cover the right categories. But several high-impact signals you already have in the database are **not surfaced** — and some critical workflow gaps remain.

## What's Missing (Highest-Impact Gaps)

### 1. Tab Badges — Know Where to Look Instantly
Currently all tabs look equal. A veteran checks the tab bar and should immediately see: "3 overdue follow-ups, 2 deals stalling, 1 meeting today." Add small count badges on each tab trigger showing items needing attention.

### 2. "What's New" Morning Briefing (Schedule Tab)
When you open the Command Center at 8 AM, you need a 3-second answer to "what changed since yesterday?" Currently missing:
- New leads that came in overnight
- New meetings booked (Calendly)
- Stage changes in last 24 hours
- Inbound emails received (from `lead_emails` table)

A compact "Since Yesterday" strip at the top of Schedule with 4 tiny counts: **+2 Leads · +1 Meeting Booked · 3 Emails · 1 Stage Change**.

### 3. Unanswered Emails in Follow-Ups
You have `lead_emails` in the database but it's only shown inside individual lead panels. The Follow-Ups tab should have a 5th section: **"Unanswered Inbound"** — emails where the last message in the thread is inbound and has no outbound reply. This is the #1 thing reps miss.

### 4. Deal Pulse: Forecast Pipeline + Win Strategy Signals
You already have `forecastCategory` (Commit/Best Case/Pipeline/Omit) and `winStrategy.dealTemperature` in deal intelligence — neither is shown. Add:
- **Forecast Strip**: 3 mini KPIs showing Commit value, Best Case value, Pipeline value
- **Deal Temperature column** in the Momentum Board (🔥 On Fire → ❄️ Cold) from `winStrategy.dealTemperature`
- **Closing Window** text from `winStrategy.closingWindow` as a tooltip or sub-line

### 5. Quick Actions Beyond "Mark Contacted"
Currently Follow-Ups only has "Contacted." Add:
- **Set Follow-Up** — a quick date picker popover to set `nextFollowUp`
- **Change Stage** — a dropdown to advance the stage right from the row
These save opening the lead panel for the 2 most common daily actions.

### 6. Prep Intel: Surface Win Strategy
The Prep Intel cards show enrichment and objections but miss the most actionable intel you already have:
- **Deal Temperature** indicator (from `winStrategy`)
- **#1 Closer** / Power Move (from `winStrategy.numberOneCloser`, `powerMove`)
- **Champion Status** (from `buyingCommittee.champion`)
- **Psychological Profile summary** (from `psychologicalProfile.realWhy`, `unspokenAsk`)

This turns prep from "here's context" into "here's exactly how to close this person."

### 7. Pipeline Velocity in Deal Pulse
Add a small "Velocity" section: average days per stage for your active deals, highlighting bottleneck stages. You already compute `daysInCurrentStage` — just aggregate by stage.

## Recommended Implementation Priority

| Priority | Enhancement | Impact | Effort |
|----------|------------|--------|--------|
| 1 | Tab badges with attention counts | High | Small |
| 2 | Quick actions (set follow-up, change stage) | High | Medium |
| 3 | Deal Pulse forecast strip + deal temperature | High | Small |
| 4 | Prep Intel win strategy signals | High | Small |
| 5 | "What's New" morning briefing strip | Medium | Medium |
| 6 | Unanswered emails in Follow-Ups | Medium | Medium |
| 7 | Pipeline velocity by stage | Medium | Small |

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `src/components/ActionQueue.tsx` | Add badge counts to TabsTrigger components; compute attention counts from leads |
| `src/components/command-center/ScheduleTab.tsx` | Add "Since Yesterday" briefing strip at top using lead dates and lead_emails query |
| `src/components/command-center/FollowUpsTab.tsx` | Add quick-action popover for set follow-up date + stage change dropdown; add unanswered emails section (query `lead_emails`) |
| `src/components/command-center/DealPulseTab.tsx` | Add forecast KPI strip (Commit/Best Case/Pipeline values); add deal temperature column to Momentum Board; add stage velocity section |
| `src/components/command-center/PrepIntelTab.tsx` | Surface `winStrategy`, `buyingCommittee.champion`, `psychologicalProfile` in intel cards |

### Data Sources
- Tab badges + briefing: derived from `leads` array dates + `lead_emails` table query
- Forecast: `lead.forecastCategory` field (already on Lead type)
- Deal temperature: `lead.dealIntelligence.winStrategy.dealTemperature`
- Win strategy: `lead.dealIntelligence.winStrategy` + `psychologicalProfile`
- Unanswered emails: query `lead_emails` grouped by lead_id, check if last email is inbound
- Stage velocity: aggregate `daysInCurrentStage` by `stage` across active leads

