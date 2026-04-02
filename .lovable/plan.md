

# Command Center — Final Comprehensive Audit

## What's Working Well
All 4 tabs render cleanly with zero runtime errors. Schedule has morning briefing, today-only priority tiers, horizon toggle synced from parent. Follow-Ups has rich rows with context signals, AI action chips with context-aware labels (Send Proposal, Follow Up, Pre-Meeting Email), sort controls, summary strip, snooze buttons, collapsible sections, AI Action Sheet with "Copy & Mark Done". Deal Pulse has KPIs with benchmark label, forecast strip, momentum board with sort, velocity cards with benchmarks. Prep Intel shows Calendly details, prospect messages, enrichment fields, meeting summaries, "Generate Prep Brief" button, deal value always shown. Edge function registered in config.toml.

## What's Still Remaining

### 1. Follow-Ups: Snooze Buttons Don't Show Toast Feedback
When clicking a snooze button (3d/7d/14d), the lead's `nextFollowUp` updates silently — no toast confirmation. The user has no feedback that the snooze worked, and the row doesn't visually move out of the overdue section until a re-render.

**Fix**: Add a toast after snooze (`"Snoozed {name} for {d} days"`) and trigger the list to refresh so the lead moves to "Due This Week" or disappears.

### 2. Follow-Ups: "Due today" Label in Overdue Section is Confusing
Peter Wylie shows as "Due today" inside the **Overdue** section header. But "Due today" isn't overdue — it's current. Items due today should appear in the "Due This Week" section instead, not under "Overdue".

**Fix**: In the `overdue` memo, change `isBefore(parseISO(l.nextFollowUp), now)` to use `startOfDay(now)` so items due today are excluded from overdue and correctly appear in "Due This Week".

### 3. Schedule Tab: "Due today" Label Shows in Red Styling
Peter Wylie shows "Due today" but the text uses `TYPE_TEXT_COLORS.overdue` (red) because the item type is still "overdue". Due-today items should use blue styling to match the Follow-Ups tab convention.

**Fix**: In `buildActionItems()`, when `daysOverdue === 0`, set type to `"meeting"` (blue) or add a new type "due-today" — or simply override the color in `ActionRow` when label is "Due today".

### 4. Deal Pulse: Momentum Board Has No Empty State
If no active deals exist in the filter, the momentum board shows an empty bordered table with just headers. No "no deals" message.

**Fix**: Add an empty state message below the momentum board header when `sortedDeals.length === 0`.

### 5. Deal Pulse: Many Deals Show "—" for Value, Temp, and Momentum
Most deals in the momentum board have no deal intelligence, so Temp and Momentum columns show "—" for the majority. This makes the columns feel wasted for datasets without deep intelligence.

**Status**: Not a bug — these populate as meetings are processed and intelligence is synthesized. The "—" is the correct default. No action needed.

### 6. Prep Intel: "Generate Prep Brief" Error Handling
The button calls `generate-meeting-prep` which may not handle leads without meetings gracefully. If it fails, the toast says "Failed to generate prep" with no actionable detail.

**Fix**: Catch the specific error message from the edge function and surface it (e.g., "No meeting data available yet — schedule a meeting first").

### 7. Follow-Ups: Action Sheet Has No Loading State for "Copy & Mark Done"
When clicking "Copy & Mark Done", it copies and updates instantly — but if the `updateLead` call fails (network error), there's no error handling. The clipboard copy succeeds but the lead update silently fails.

**Fix**: Wrap `handleApply` in try/catch and show error toast on failure.

### 8. Prep Intel: Enrichment Company Description Not Shown
The plan called for showing `enrichment.companyDescription` on Prep Intel cards. The context grid shows `acquisitionStrategy`, `buyerType`, `geography`, `targetCriteria` — but not the company description, which is often the most useful enrichment field for meeting prep.

**Fix**: Add `enrichment.companyDescription` (truncated to 150 chars) as a line above the context grid, similar to how "Prospect said:" is shown.

### 9. Schedule Tab: Peter Wylie "Due today" is Still Red-Styled
Looking at the screenshot, Peter Wylie shows "Due today" in red text (from the `overdue` type text color). The "Due today" label was fixed but the color still uses the overdue red instead of blue.

**Fix**: In `ActionRow`, check if `item.label === "Due today"` and override color to blue.

---

## Priority Implementation Plan

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Move "Due today" items from Overdue to Due This Week in Follow-Ups | `FollowUpsTab.tsx` | UX logic bug |
| 2 | Fix "Due today" color in Schedule tab (red → blue) | `ScheduleTab.tsx` | Visual consistency |
| 3 | Add toast feedback after snooze | `FollowUpsTab.tsx` | UX feedback |
| 4 | Show enrichment.companyDescription on Prep Intel cards | `PrepIntelTab.tsx` | Intel completeness |
| 5 | Add empty state to momentum board | `DealPulseTab.tsx` | Edge case |
| 6 | Better error handling in Prep Brief generation | `PrepIntelTab.tsx` | Error UX |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/FollowUpsTab.tsx` | Use `startOfDay` to exclude today from overdue; add toast to snooze buttons |
| `src/components/command-center/ScheduleTab.tsx` | Override "Due today" color to blue in ActionRow |
| `src/components/command-center/PrepIntelTab.tsx` | Show enrichment.companyDescription; improve error message in prep brief |
| `src/components/command-center/DealPulseTab.tsx` | Add empty state for momentum board |

