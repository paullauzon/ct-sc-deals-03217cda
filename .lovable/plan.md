

# Command Center — Comprehensive Final Audit

## Verified Status (All 4 Tabs)

All tabs render with zero runtime errors. 212 leads loaded. 3 AI edge functions on gpt-4o. Badge counts: Schedule=2, Follow-Ups=26, Deal Pulse=27, Prep Intel=3.

**Schedule**: Morning briefing, 3 meeting cards (2 today, 1 in 6d), "Due today" in blue, "1d overdue" in red, horizon toggle synced, summary stats. Working correctly.

**Follow-Ups**: 98 items, 5 sections (Overdue/Due This Week/Unanswered/Untouched/Going Dark), rich rows with context signals, AI action chips, batch snooze (>14d visible, >30d hidden when 0), sort controls, summary strip with colored counts, AI Action Sheet with Copy & Mark Done + Copy as Email + Regenerate + stage advancement + calendar picker. Working correctly.

**Deal Pulse**: 4 KPIs with benchmark label, forecast strip, momentum board with Has Intel toggle (81) and sort controls, velocity cards with benchmarks, renewals section. Working correctly.

**Prep Intel**: 3 cards with Calendly details, Research Prospect for 0-meeting leads, Draft Pre-Meeting Email, Deal Room link, prospect messages, company descriptions, context grid. Working correctly.

---

## Remaining Issues

### 1. "Has Intel (81)" Filter Is Correct — But "Steady" Momentum Looks Like No Data

The 81 count is accurate (86 total in DB, minus closed = ~81 active). The real problem is the `MomentumIcon` component: "Steady" momentum renders as a `<Minus>` icon which visually looks identical to the "—" text shown when no data exists. A veteran scanning the board can't distinguish "Steady" from "no data."

**Fix**: In `DealPulseTab.tsx`, add a distinct visual for "Steady" momentum — use a different icon (e.g., `Minus` with a colored tint like `text-blue-400`) or show the text "Steady" instead of a flat dash. Also show "Neutral" distinctly.

### 2. Deal Pulse: Momentum Board Rows Show No Deal Value for Most Deals

Most rows show "—" for Value because `dealValue` is 0. This is correct data-wise but makes the board feel empty. No code fix needed — this is a data issue, not a UI bug.

### 3. Prep Intel: "Deal Room" Link Goes to `/deal/{id}` — Wrong Route

The Deal Room link in PrepIntelTab (line 465) uses `href={/deal/${lead.id}}` but the actual route is `/deal-room/{leadId}` based on `src/pages/DealRoom.tsx`. This link will 404.

**Fix**: Change the href from `/deal/${lead.id}` to `/deal-room/${lead.id}`.

### 4. Follow-Ups: "Due today" Items Show in Overdue Section

The overdue filter uses `isBefore(parseISO(l.nextFollowUp), todayStart)` which correctly excludes items due today from the overdue section. Items due today appear in "Due This Week" with a "Today" label and inverted styling. This is working correctly.

### 5. No Automated Follow-Up Task Playbooks (Original Vision Gap)

Your original prompt asked for automated task sequences after each sales action. Currently the AI Action Sheet generates single drafts. There is no multi-step task sequence — e.g., after "Meeting Set": Day 0 confirmation → Day -1 agenda → Day +1 follow-up.

This is the single biggest remaining gap. It requires:
- A `lead_tasks` database table
- Playbook templates per stage transition
- AI-powered task generation with lead context
- UI showing pending tasks in Follow-Ups and Prep Intel
- Auto-creation when stages change

**Status**: Major feature — not a bug fix.

### 6. Schedule Tab: Empty "At Risk" and "Monitor" Tiers

The Schedule tab filters tiers to today-only items. Since "dark", "untouched", and "stale" are excluded, only "overdue" (due today) and "renewal" (within 7 days) appear. This means "At Risk" and "Monitor" tiers are always empty — they just don't render (correct behavior via `if (items.length === 0) return null`).

**Status**: Working as designed.

---

## What Actually Needs Fixing (3 Items)

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | "Steady" momentum icon indistinguishable from no data | `DealPulseTab.tsx` | UX — veteran can't scan momentum at a glance |
| 2 | Deal Room link goes to wrong route (`/deal/` vs `/deal-room/`) | `PrepIntelTab.tsx` | Bug — link 404s |
| 3 | Automated task playbooks not built | New feature | Original vision gap |

## Implementation

### Fix 1: Distinct "Steady" / "Neutral" Momentum Icons (DealPulseTab.tsx)

Update the `MomentumIcon` component to render "Steady" and "Neutral" with a tinted horizontal arrow or colored dash, not the same gray `<Minus>` used for no data. Add a text label in the tooltip.

```text
Current:
  Accelerating → green TrendingUp
  Stalling/Stalled → red TrendingDown
  default (including Steady/Neutral) → gray Minus (same as "no data")

Fixed:
  Accelerating → green TrendingUp
  Stalling/Stalled → red TrendingDown  
  Steady/Neutral → blue-gray Minus (distinct from "no data" null)
  No data (empty string) → gray "—" text
```

### Fix 2: Correct Deal Room Route (PrepIntelTab.tsx)

Change line 465 from `/deal/${lead.id}` to `/deal-room/${lead.id}`.

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/DealPulseTab.tsx` | Distinguish "Steady"/"Neutral" momentum from no-data; add tooltip text |
| `src/components/command-center/PrepIntelTab.tsx` | Fix Deal Room href to `/deal-room/${lead.id}` |

