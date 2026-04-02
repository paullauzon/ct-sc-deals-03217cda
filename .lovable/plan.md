

# Command Center Audit — What's Remaining

## Status Summary

The 4-tab structure (Schedule, Follow-Ups, Deal Pulse, Prep Intel) is fully built with badge counts, morning briefing, sort controls, AI action sheet, forecast KPIs, momentum board, velocity, and win-strategy intel cards. No runtime errors. Below is everything that still needs work.

---

## Issues Found

### 1. Follow-Ups: Action chips only visible on hover — not actionable on mobile/touch
The action chip (Draft Outreach, Reply, etc.) uses `opacity-0 group-hover:opacity-100` (line 164). On mobile or touch devices, hover doesn't exist — users can never see or tap these buttons.

**Fix**: Always show the action chip (remove opacity-0 logic), make it a subtle but always-visible pill.

### 2. Follow-Ups: Calendar renders inline in Action Sheet — broken layout
The `ActionSheet` renders a full `<Calendar>` component inline next to the suggested date text (lines 311-316). This makes the sheet extremely tall and the calendar sits awkwardly beside a text label. Should be a date picker popover instead.

**Fix**: Wrap Calendar in a Popover triggered by clicking the date text.

### 3. Follow-Ups: `overdueSet` declared with `useMemo(() => new Set(), [])` — never actually reactive
Line 490 creates a stable empty Set that's mutated inside another `useMemo`. This is a React anti-pattern — the Set reference never changes so dependent memos (`goingDark`, `unansweredLeads`) may not re-compute correctly.

**Fix**: Compute `overdueSet` inside the `overdue` memo and return it alongside the array, or derive it separately.

### 4. Follow-Ups: `goingDark` missing `sortField/sortDir` application
Line 526-540: `goingDark` has `sortField, sortDir` in its dependency array but doesn't call `applySortToLeads` — it only uses default `.sort()`. Sorting buttons don't affect this section.

**Fix**: Apply `applySortToLeads` like the other sections.

### 5. Deal Pulse: Momentum Board grid doesn't respond well below ~900px
The 7-column grid (`grid-cols-[1fr_100px_70px_80px_50px_50px_80px]`) on line 145 is fixed and will overflow/clip on smaller screens.

**Fix**: Make the board horizontally scrollable with `overflow-x-auto`, or collapse columns on mobile.

### 6. Prep Intel: Only shows meetings within 7 days — inconsistent with Schedule tab's 30d horizon
The Prep Intel tab hardcodes a 7-day window (line 34). If a user extends the Schedule tab to 14d or 30d, Prep Intel still only shows 7d.

**Fix**: Add the same horizon toggle (or match the Schedule tab's horizon state by lifting it to `ActionQueue`).

### 7. Schedule: "Since Yesterday" briefing strip counts ALL leads, not just filtered owner
Line 107-114: `MorningBriefing` receives `leads` (all) and filters by owner — correct. But the email query on line 139 uses `filtered` lead IDs which IS correct. No issue here actually.

### 8. Edge Function: Enrichment field paths are wrong
Line 104: `e.companyProfile?.summary` — this field doesn't exist on `LeadEnrichment`. The actual fields are `companyDescription`, `buyerMotivation`, `urgency`. Same for `e.suggestedUpdates?.motivation` (line 105) — the actual shape is `suggestedUpdates.stage`, `suggestedUpdates.nextFollowUp`, etc. The enrichment context sent to AI is largely empty.

**Fix**: Use correct field names: `e.companyDescription`, `e.buyerMotivation`, `e.urgency`, etc.

### 9. Edge Function: No `lastEmail` is ever passed from the client
The Action Sheet (line 210-232) never fetches or passes `lastEmail` for `reply-inbound` action types. The edge function supports it (lines 140-145) but receives nothing.

**Fix**: When `actionType === "reply-inbound"`, fetch the latest inbound email from `lead_emails` and pass it.

### 10. Action Sheet: Missing `SheetDescription` — accessibility warning
Radix Dialog requires either `aria-describedby` or a `SheetDescription`. Currently only `SheetTitle` is rendered.

**Fix**: Add a hidden `SheetDescription`.

### 11. Schedule Tab: `buildActionItems` is exported and imported in `ActionQueue.tsx` (line 10) but never used there
The import on line 10 of `ActionQueue.tsx` is dead code.

**Fix**: Remove unused import.

---

## Remaining Feature Gaps (from approved plans)

### A. "Copy to Clipboard" should also offer "Copy as Email" format
Currently just copies raw text. For email drafts, should format with subject line separated.

### B. No bulk actions on Follow-Ups
Multiple plans mentioned batch-select for setting follow-up dates or stage changes across multiple leads. Not implemented.

### C. No "What's New" count for stage changes in badge computation
The badge on the Schedule tab counts only meetings today. The morning briefing shows stage changes, but the tab badge doesn't reflect overnight activity.

---

## Implementation Plan

| Priority | Fix | File |
|----------|-----|------|
| 1 | Always show action chips (remove hover-only) | `FollowUpsTab.tsx` line 164 |
| 2 | Fix enrichment field paths in edge function | `generate-follow-up-action/index.ts` lines 102-107 |
| 3 | Fetch & pass `lastEmail` for reply-inbound actions | `FollowUpsTab.tsx` ActionSheet |
| 4 | Fix `overdueSet` React anti-pattern | `FollowUpsTab.tsx` line 490 |
| 5 | Apply sort to `goingDark` section | `FollowUpsTab.tsx` line 526 |
| 6 | Calendar → Popover date picker in Action Sheet | `FollowUpsTab.tsx` lines 311-316 |
| 7 | Add `SheetDescription` for accessibility | `FollowUpsTab.tsx` line 278 |
| 8 | Make Momentum Board responsive | `DealPulseTab.tsx` line 145 |
| 9 | Add horizon toggle to Prep Intel (or share state) | `PrepIntelTab.tsx` + `ActionQueue.tsx` |
| 10 | Remove dead import in ActionQueue | `ActionQueue.tsx` line 10 |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/FollowUpsTab.tsx` | Fix action chip visibility, overdueSet pattern, goingDark sort, Calendar popover, SheetDescription, lastEmail fetch |
| `supabase/functions/generate-follow-up-action/index.ts` | Fix enrichment field paths to match `LeadEnrichment` type |
| `src/components/command-center/DealPulseTab.tsx` | Wrap momentum board in `overflow-x-auto` |
| `src/components/command-center/PrepIntelTab.tsx` | Accept and use `meetingHorizon` prop |
| `src/components/ActionQueue.tsx` | Remove dead import, pass `meetingHorizon` to PrepIntelTab |

