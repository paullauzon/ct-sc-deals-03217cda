

# Command Center — Final Comprehensive Audit

## Current Status: Feature-Complete, 3 Remaining Issues

After reviewing all ~2,900 lines across the 4 tabs + ActionQueue, the Command Center is fully functional. All originally requested features are built and wired. Here is what remains:

---

## Issues Found

### 1. Bug: FollowUpRow keyboard navigation refs are broken
**File**: `FollowUpsTab.tsx` line 793
The `rowRef` is created as a new object literal `{ current: null }` on every render and never connected to the refs map (`rowRefs.current`). This means `scrollIntoView` on line 775 never fires — keyboard navigation with j/k works for highlighting but the view never scrolls to the active row.

**Fix**: Connect `rowRef` to the `rowRefs` Map using a callback ref pattern, and pass the actual `rowIndex` so the ref is stored correctly.

### 2. Bug: FollowUpRow `rowIndex` counter resets on every render cycle
**File**: `FollowUpsTab.tsx` line 780
`let rowIndex = 0;` is declared inside the render body but the `rowProps` helper increments it. Since each section calls `rowProps` independently in JSX, the counter only works if all sections render in a single pass. This is fragile — and more critically, the `isActive` check (line 792) compares against a counter that doesn't account for collapsed sections, while `flatLeadIds` (line 734) does. These can desync, causing the wrong row to highlight.

**Fix**: Pre-compute a `leadIdToIndex` map from `flatLeadIds` and use `flatLeadIds.indexOf(lead.id)` instead of an incrementing counter.

### 3. Minor: "Due today" items can appear in both Overdue and Due This Week
**File**: `FollowUpsTab.tsx`
The overdue filter uses `isBefore(parseISO(l.nextFollowUp), todayStart)` (line 682) which correctly excludes today. But the `dueThisWeek` filter (line 697) uses `!isBefore(d, todayStart)` which includes today. Meanwhile, `FollowUpRow` for overdue shows `daysOverdue === 0 ? "Due today"` (line 846). Since `daysOverdue` uses `differenceInDays(now, ...)` which can be 0 for items due earlier today, an item due at midnight today could show as "0d overdue" labeled "Due today" in the Overdue section AND also appear in Due This Week. This is a minor edge case but worth fixing by ensuring the overdue label never shows "Due today" (it should show "1d overdue" minimum since the filter already excludes today-start).

---

## Everything Else: Working Correctly

**Schedule Tab**: Morning briefing, meeting cards with time grouping, playbook tasks due today, priority tiers filtered to today-only items, summary stats strip. All correct.

**Follow-Ups Tab**: 5 sections (Overdue, Due This Week, Unanswered Inbound, Untouched, Going Dark) with deduplication. Rich rows with deal value, meeting count, email count, Calendly, task badge. Context-aware AI action chips. Batch snooze (>14d, >30d). Inline snooze (3d/7d/14d). Sort controls. AI Action Sheet with Copy & Mark Done, Regenerate, stage advance, calendar picker. Inline task checklist expansion. All correct.

**Deal Pulse Tab**: 4 KPIs with benchmark labels, forecast strip, momentum board with Has Intel toggle and sort controls, "Steady" as distinct blue text, velocity cards with benchmarks, renewals section, empty state. All correct.

**Prep Intel Tab**: Cards with Calendly details, Research Prospect (correct flat payload + DB persistence), Generate Prep Brief (correct full payload), Draft Pre-Meeting Email, Deal Room link (correct `/deal/` route), prospect messages, company descriptions, context grid, win strategy, psychological profile, enrichment highlights, open items, deal narrative, playbook tasks section. All correct.

**Playbook System**: `lead_tasks` table exists. 5 playbook definitions. Stage-change triggers in LeadContext with stale task cleanup. useLeadTasks hook. All 3 tabs wired to display tasks. All correct.

---

## Plan: Fix the 2 Bugs

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/FollowUpsTab.tsx` | Fix keyboard nav scroll refs using `flatLeadIds.indexOf(lead.id)` instead of incrementing counter; fix rowRef connection to enable scrollIntoView |

