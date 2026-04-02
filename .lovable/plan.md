

# Redesign Follow-Ups Tab into an Actionable Intelligence List

## Problem
The Follow-Ups tab is a flat wall of names with no context. A sales veteran looking at 78 overdue leads can't tell: Who has a meeting history? Who responded to outreach? Who's worth chasing vs. writing off? There's no way to sort or prioritize. The "Stage" dropdown and "Contacted" button feel generic. The design uses colored text that clashes with the minimal black-and-white aesthetic.

## Design Philosophy
Every row must answer 3 questions in under 2 seconds:
1. **Who is this?** (name, company, brand, deal value)
2. **What's our history?** (stage, has meetings, has emails, last contact)
3. **What should I do next?** (the recommended action)

## Changes

### 1. Richer Follow-Up Rows — Context at a Glance
Replace the current sparse row with a two-line layout per lead:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ [CT] Ben Williams    Treatyoakequity    Meeting Held   [M]         │
│      $6,000 · Last contact: Mar 3 · 🎤 2 meetings · ✉ 4 emails   │
│                                              30d overdue  [⚡][▾] │
└─────────────────────────────────────────────────────────────────────┘
```

**Line 1**: Brand logo, name, company, stage badge, owner avatar
**Line 2**: Deal value, last contact date, meeting count icon (microphone), email count icon (envelope), Calendly indicator if meeting scheduled
**Right side**: Overdue/status label + compact action buttons

The key signals added per row:
- **Meeting count** (`lead.meetings.length`) — shows `🎤 2` if they have Fireflies meetings
- **Has Calendly** — small calendar icon if `calendlyBookedAt` exists
- **Email count** — fetched from `lead_emails` table, shown as `✉ 4`
- **Last contact** — formatted date, not just days
- **Deal value** — always visible, not hidden behind conditions

### 2. Sort Controls — Prioritize What Matters
Add a sort bar above the list with toggle buttons:

**Sort by**: `Overdue` (default) | `Deal Value` | `Last Contact` | `Stage` | `Name`

Each button toggles ascending/descending. This lets the veteran immediately surface:
- Highest-value stale deals (sort by Deal Value desc)
- Longest-silent contacts (sort by Last Contact asc)
- Stage-based workflow (sort by Stage to batch-process)

### 3. Section Redesign — Cleaner Visual Hierarchy
- Remove colored section text (red, amber, emerald, purple) — replace with monochrome section headers using subtle left borders and dot indicators per the design system
- Section headers become: `● OVERDUE (78)` with a subtle red dot, all text in foreground/muted
- Collapse "Going Dark" items that overlap with "Overdue" — if a lead is both overdue AND going dark, show only in Overdue with a "silent Xd" sub-label

### 4. Quick Actions Refinement
Replace the cramped Stage dropdown + Contacted button with a single action menu:
- **Primary action**: "Set Next Step" — opens a small popover with: date picker + stage selector + a "Mark Contacted" checkbox, all in one compact form
- This reduces 3 separate controls to 1 clean button per row

### 5. "Recommended Next Action" Intelligence
For leads with `dealIntelligence` or `enrichment`, show a one-line AI recommendation:
- If `dealIntelligence.actionItemTracker` has open items → show the top one
- If `enrichment.suggestedUpdates.nextFollowUp` exists → show "AI suggests follow-up by [date]"
- If lead has meetings but stage is still "Meeting Held" → show "Advance stage?"
- Displayed as a subtle italic line under the stats row

### 6. Fetch Email Counts in Bulk
Instead of only checking unanswered emails, fetch total email counts per lead in one query to show the `✉ N` indicator on every row. Use a single aggregated query:
```sql
SELECT lead_id, COUNT(*) as count FROM lead_emails WHERE lead_id IN (...) GROUP BY lead_id
```

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `src/components/command-center/FollowUpsTab.tsx` | Complete rewrite: two-line rows with meeting/email/calendly signals, sort controls, bulk email count fetch, recommended actions, refined section headers, single "Next Step" action popover |

### Data Sources
- Meeting count: `lead.meetings.length` (already on Lead object)
- Calendly: `lead.calendlyBookedAt` (already on Lead)
- Email counts: single query to `lead_emails` grouped by `lead_id`
- AI recommendations: `lead.dealIntelligence?.actionItemTracker`, `lead.enrichment?.suggestedUpdates`
- All sort fields already exist on the Lead type

### Sort State
- `sortField`: `"overdue" | "dealValue" | "lastContact" | "stage" | "name"`
- `sortDir`: `"asc" | "desc"`
- Applied within each section independently (overdue sorted by chosen field, due this week by chosen field, etc.)

