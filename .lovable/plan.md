

# Command Center — Final Audit & Remaining Fixes

## Current State Summary
All 4 tabs render cleanly. Follow-Ups has rich rows with action chips, sort controls, summary strip, and AI Action Sheet. Deal Pulse has KPIs, forecast, momentum board with sort, and velocity. Prep Intel shows cards with Calendly details and "Generate Prep Brief". Schedule has morning briefing, meeting cards, and priority tiers.

---

## Issues Still Remaining

### 1. Edge Function Missing from config.toml
`generate-follow-up-action` is not registered in `supabase/config.toml` with `verify_jwt = false`. This means clicking any action chip on Follow-Ups will fail with a 401 JWT error.

**Fix**: Add `[functions.generate-follow-up-action]` with `verify_jwt = false` to `config.toml`.

### 2. Schedule Tab: Duplicate Horizon Toggle Still Present
The Schedule tab has its own internal `meetingHorizon` state (line 247) and its own 7d/14d/30d toggle (lines 300-306). The ActionQueue also shows a horizon toggle for the intel tab (line 131). These are independent — the Schedule tab ignores the parent. This was flagged in prior audits but not fixed.

**Fix**: Remove the internal `meetingHorizon` from `ScheduleTab`, accept it as a prop from `ActionQueue`, and show the horizon toggle in the ActionQueue header for both schedule and intel tabs.

### 3. Prep Intel: Context Grid Shows Redundant Data
The "Context Grid" (lines 168-190) duplicates info already shown in the signal strip above it. Stage appears twice, deal value appears twice. This wastes space on cards that need to maximize useful intel.

**Fix**: Remove duplicate fields from the context grid (stage, value) that are already in the signal strip. Keep only fields that add new information (interest, intent, sentiment, momentum, window).

### 4. Prep Intel: Cards Show "Stage: Meeting Set" Twice
In the signal strip (line 150-152) AND in the context grid (line 169-171), the stage badge appears. Redundant.

**Fix**: Remove stage from context grid since it's in the signal strip.

### 5. Schedule Tab: Summary Stats Show "66 Going Dark" — Alarming Without Context
The stats strip shows "66 Going Dark" which is an enormous number and dominates the Schedule tab (which is about today's agenda, not re-engagement). These stats duplicate what Follow-Ups already shows better.

**Fix**: On the Schedule tab, only show meeting-relevant stats (Overdue, Meetings, Renewals). Move Going Dark/Untouched/Stale to Follow-Ups only (which already has them).

### 6. Schedule Tab: "Urgent" Tier Conflates Overdue Follow-Ups with Schedule
The Schedule tab mixes overdue follow-ups (78 items) with today's meetings (3 items). A user coming to "Schedule" wants to see their agenda, not be overwhelmed by 78 overdue items that belong in Follow-Ups.

**Fix**: On the Schedule tab, limit the priority tiers to only TODAY's items — today's meetings plus today's overdue. Move the full overdue list to Follow-Ups (which already has it).

### 7. Deal Pulse: "Avg Days in Stage: 14d" KPI Has No Color Coding
14 days in stage is borderline concerning but the KPI shows it in neutral styling.

**Fix**: Apply `daysInStageColor` to the avg days KPI number.

### 8. Follow-Ups: "0d overdue" Label for Peter Wylie
If a lead's follow-up is today, showing "0d overdue" is confusing — it's due today, not overdue.

**Fix**: If `daysOverdue === 0`, show "Due today" instead of "0d overdue" and use the blue "due today" styling instead of red overdue.

### 9. Follow-Ups: No "Unanswered" Count in Summary Strip
The summary strip shows "78 Overdue, 4 Due This Week, 10 Untouched, 6 Going Dark" but I don't see an "Unanswered" count even though it's coded at line 586. This means either no unanswered emails exist in the data, or the query has an issue.

**Status**: Not a code bug — just no inbound-last emails in current dataset. Working as designed.

### 10. Prep Intel: No Prior Meeting Summaries Shown
For leads with `meetingCount > 0`, the card shows "1 meeting" but doesn't show what was discussed. Prior meeting summaries would be invaluable for prep.

**Fix**: If `latestMeeting?.intelligence?.summary` exists, show a truncated summary in the card.

---

## Implementation Plan

| Priority | Fix | File |
|----------|-----|------|
| 1 | Add `generate-follow-up-action` to config.toml | `supabase/config.toml` |
| 2 | Fix "0d overdue" → "Due today" | `FollowUpsTab.tsx` |
| 3 | Lift `meetingHorizon` out of ScheduleTab, accept as prop | `ScheduleTab.tsx` + `ActionQueue.tsx` |
| 4 | Remove duplicate stage/value from Prep Intel context grid | `PrepIntelTab.tsx` |
| 5 | Add prior meeting summary to Prep Intel cards | `PrepIntelTab.tsx` |
| 6 | Apply color coding to Deal Pulse avg days KPI | `DealPulseTab.tsx` |
| 7 | Slim Schedule tab stats to meeting-relevant only | `ScheduleTab.tsx` |

### Files Changed

| File | Changes |
|------|---------|
| `supabase/config.toml` | Add `[functions.generate-follow-up-action]` with `verify_jwt = false` |
| `src/components/command-center/FollowUpsTab.tsx` | "0d overdue" → "Due today" with blue styling |
| `src/components/command-center/ScheduleTab.tsx` | Accept `meetingHorizon` as prop, remove internal state + duplicate toggle. Slim stats strip. |
| `src/components/ActionQueue.tsx` | Show horizon toggle for both schedule + intel tabs. Pass `meetingHorizon` to ScheduleTab. |
| `src/components/command-center/PrepIntelTab.tsx` | Remove duplicate fields from context grid. Add latest meeting summary snippet. |
| `src/components/command-center/DealPulseTab.tsx` | Color-code avg days KPI |

