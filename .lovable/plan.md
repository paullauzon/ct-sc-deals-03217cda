

# Command Center — Final Comprehensive Audit

## What's Working Well
- All 4 tabs render with no runtime errors
- Schedule: Morning briefing, meeting cards, today-only priority tiers, horizon toggle synced with parent
- Follow-Ups: Rich rows with context signals (deal value, meetings, emails, Calendly), AI action chips with context-aware labels (Send Proposal, Follow Up, Pre-Meeting Email), sort controls, summary strip, collapsible sections, AI Action Sheet with draft generation, Copy All / Copy as Email
- Deal Pulse: KPIs, forecast strip, momentum board with sort controls, velocity cards with benchmark labels, renewals section
- Prep Intel: Cards with Calendly details, email counts, meeting history, enrichment fields, "Generate Prep Brief" button, deal value always shown
- Edge function `generate-follow-up-action` registered in config.toml with `verify_jwt = false`

## Remaining Issues

### 1. Schedule Tab: "0d overdue" Still Shows for Peter Wylie
The Schedule tab's Urgent tier shows Peter Wylie as "0d overdue" in red. The Follow-Ups tab correctly shows "Due today" with dark styling, but the Schedule tab's `ActionRow` component renders the raw label from `buildActionItems()` which generates `"0d overdue"` at line 74 of ScheduleTab.tsx.

**Fix**: In `buildActionItems()` (line 74), change the label: if `daysOverdue === 0`, set label to `"Due today"` instead of `"0d overdue"`.

### 2. Schedule Tab: Summary Shows "78 Overdue" — Misleading
The stats strip at line 302 counts ALL overdue items from `buildActionItems()` (78), but the priority tiers below only show today's overdue (2). This mismatch is confusing — it says 78 overdue but only shows 2 items.

**Fix**: Change the stats strip to reflect the filtered tier counts (what's actually shown), not the total from `items`. Show "2 Due Today" instead of "78 Overdue".

### 3. Follow-Ups: Action Sheet Missing "Send & Schedule" Workflow
The Action Sheet has "Mark Contacted & Update" but no ability to actually send the email. It generates a draft, the user copies it manually, then clicks a button. A 50-year sales veteran would want a streamlined "Copy + Mark Done" single action.

**Fix**: Rename "Mark Contacted & Update" to "Copy & Mark Done" — auto-copy the content to clipboard AND update the lead in one click.

### 4. Follow-Ups: No Quick-Dismiss / Snooze for Overdue Items
78 overdue items with no way to snooze or batch-dismiss stale ones. A veteran needs to quickly snooze a lead for 3/7/14 days without opening the full detail panel.

**Fix**: Add inline snooze buttons (3d, 7d, 14d) to each row that set `nextFollowUp` to that many days from now.

### 5. Prep Intel: Cards Are Still Sparse for New Leads
Cards for Cody Mauri, john lindsey show only: Calendly badge, $0, Meeting Set, and "Generate Prep Brief" button. No company description, no submission message, no form data. The lead's original `message` field (their form submission) is valuable prep context but isn't shown.

**Fix**: Show `lead.message` (truncated) on Prep Intel cards when available — this is often the prospect's own description of what they're looking for.

### 6. Deal Pulse: "Avg Days in Stage" KPI Shows 14d Without Benchmark Context
The KPI card shows "14d" with amber color from `daysInStageColor`, but the velocity cards below have benchmark labels ("on track", "watch", "above target"). The KPI card should also have a benchmark label for consistency.

**Fix**: Add a benchmark label below the 14d value in the KPI card, matching the velocity card pattern.

### 7. Follow-Ups: Email Count Query Hits 1000-Row Supabase Limit
The email count query at line 477-488 uses `.select("lead_id").in("lead_id", ids)` without `.limit()`. With 100+ active leads, this could hit the 1000-row default limit and undercount emails.

**Fix**: Use `{ count: "exact", head: true }` grouped approach, or add `.limit(5000)` to the query.

### 8. Prep Intel: Email Count Query Has Same 1000-Row Limit Issue
Same pattern at PrepIntelTab line 45-49.

**Fix**: Same as above.

---

## Priority Implementation Plan

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Fix "0d overdue" label in buildActionItems | `ScheduleTab.tsx` line 74 | Visual bug |
| 2 | Fix Schedule stats to show filtered counts | `ScheduleTab.tsx` lines 289-308 | UX confusion |
| 3 | Add "Copy & Mark Done" to Action Sheet | `FollowUpsTab.tsx` line 367 | Workflow efficiency |
| 4 | Add inline snooze buttons (3d/7d/14d) to Follow-Up rows | `FollowUpsTab.tsx` FollowUpRow component | Workflow efficiency |
| 5 | Show lead.message on Prep Intel cards | `PrepIntelTab.tsx` IntelCard | Intel completeness |
| 6 | Add benchmark label to Avg Days KPI | `DealPulseTab.tsx` line 133 | Visual consistency |
| 7 | Fix email count queries with proper limits | `FollowUpsTab.tsx` + `PrepIntelTab.tsx` | Data accuracy |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/ScheduleTab.tsx` | Fix "0d overdue" → "Due today" in buildActionItems; change stats strip to show filtered tier counts |
| `src/components/command-center/FollowUpsTab.tsx` | Rename action button to "Copy & Mark Done" with auto-copy; add inline snooze buttons; fix email query limit |
| `src/components/command-center/PrepIntelTab.tsx` | Show lead.message as prep context; fix email query limit |
| `src/components/command-center/DealPulseTab.tsx` | Add benchmark label to Avg Days KPI card |

