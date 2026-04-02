

# Command Center — Final Comprehensive Audit

## Verified Status (All 4 Tabs, Live)

All tabs render with zero runtime errors. 212 leads loaded. 3 AI edge functions on gpt-4o. Badge counts: Schedule=2, Follow-Ups=26, Deal Pulse=27, Prep Intel=3.

**Schedule**: Morning briefing, 3 meeting cards (2 today, 1 in 6d), "Due today" in blue, "1d overdue" in red, horizon toggle synced, Urgent tier with 2 items. Working correctly.

**Follow-Ups**: 98 items, 5 sections (77 Overdue / 5 Due This Week / 10 Untouched / 6 Going Dark), rich rows with context signals, AI action chips, batch snooze (>14d visible, >30d hidden when 0), sort controls, summary strip. Working correctly.

**Deal Pulse**: 4 KPIs, forecast strip, momentum board with Has Intel toggle (81), sort controls, velocity cards with benchmarks. Working correctly.

**Prep Intel**: 3 cards with Calendly details, Research Prospect for 0-meeting leads, Draft Pre-Meeting Email, Deal Room link, prospect messages, company descriptions, context grid. Working correctly.

---

## Remaining Issues

### 1. "Steady" Momentum Icon Still Visually Indistinguishable

DB query confirms 81 deals genuinely have momentum data (56 Steady, 14 Accelerating, 4 Steady+Lukewarm, etc.). The blue-400 `<Minus>` icon for "Steady" is technically distinct from the gray "—" text for no-data, but at 14px they look nearly identical on screen. A sales veteran scanning 80+ rows cannot instantly distinguish "Steady" from "missing."

**Fix**: Replace the Minus icon for Steady/Neutral with either:
- A small text label "Steady" in blue-400 (most distinct)
- Or an `ArrowRight` icon in blue-400 (implies "moving forward at constant pace")

### 2. "Has Intel (81)" Count Is Actually Correct

DB confirms 81 active deals have non-empty momentum strings and 79 have non-empty temperature strings. The filter logic is correct. The visual confusion stems from issue #1 above — the "Steady" icon looks like "no data."

**Status**: Not a code bug. Fixed by addressing issue #1.

### 3. Deal Room Link Route Is Correct

The route is `/deal/:id` (App.tsx line 24) and PrepIntelTab line 465 uses `/deal/${lead.id}`. This is correct. No fix needed.

### 4. Follow-Ups "Unanswered" Section Missing from Summary Strip

The summary strip shows "77 Overdue · 5 Due This Week · 10 Untouched · 6 Going Dark" but does NOT show "Unanswered" count. Looking at the code (line 615), it does render unanswered count but only when `unansweredLeads.length > 0`. On the live screenshot, the Unanswered section is indeed not visible in the summary — likely because unanswered detection depends on email data availability.

**Status**: Working as designed — shows when data exists.

### 5. No Automated Follow-Up Task Playbooks (Original Vision Gap)

This is the single biggest remaining gap from your original vision. Currently the AI Action Sheet generates single drafts. There is no multi-step automated sequence.

What a 50+ year sales veteran would expect:

```text
STAGE TRANSITION → AUTO-GENERATED TASK SEQUENCE

Meeting Set:
  Day 0: Send confirmation email (AI-drafted, personalized)
  Day -1: Send prep agenda with talking points
  Day +0: Auto-generate prep brief before call
  Day +1: Post-meeting follow-up with action items

Meeting Held (no proposal yet):
  Day +1: Send recap + next steps email
  Day +3: Check-in if no response
  Day +7: Re-engage with added value

Proposal Sent:
  Day +2: "Any questions?" check-in
  Day +5: Value-add follow-up (case study, data point)
  Day +10: Direct ask / negotiation nudge

Going Dark (21+ days silent):
  Day 0: Re-engagement with market insight
  Day +7: Breakup email (last attempt)
  Day +14: Archive or reassign

No Response to Initial Outreach:
  Day +3: Different angle follow-up
  Day +7: LinkedIn touchpoint suggestion
  Day +14: Final attempt with scarcity angle
```

This requires:
- A `lead_tasks` database table (task, type, due_date, status, lead_id, playbook_id, sequence_order)
- Playbook templates per stage transition
- AI-powered task content generation using lead context
- UI showing pending tasks per lead in Follow-Ups and Prep Intel
- Auto-creation when stages change (via trigger or client-side logic)

**Status**: Major feature. Not a bug fix.

---

## What Actually Needs Fixing (1 Item + 1 Major Feature)

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | "Steady" momentum visually identical to no-data | `DealPulseTab.tsx` | UX — can't scan at a glance |
| 2 | No automated task playbooks | New feature | Original vision gap |

## Implementation Plan

### Fix 1: Distinct "Steady" Momentum Display (DealPulseTab.tsx)

Replace the `<Minus>` icon for Steady/Neutral with a small text badge:
- "Steady" → `<span className="text-[9px] text-blue-400 font-medium">Steady</span>`
- "Neutral" → `<span className="text-[9px] text-blue-400 font-medium">Neutral</span>`
- No data → `<span className="text-[10px] text-muted-foreground">—</span>` (unchanged)

This makes the distinction unmistakable at any screen size.

### Feature 2: Automated Task Playbooks (Deferred — Major Build)

Not included in this implementation. Would require:
1. New `lead_tasks` table with RLS
2. Playbook template definitions (JSON or edge function)
3. Stage-change trigger to auto-create task sequences
4. AI content generation for each task using lead context
5. UI in Follow-Ups showing pending playbook tasks
6. Task completion/snooze/skip controls

---

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/DealPulseTab.tsx` | Replace Minus icon for Steady/Neutral with text label for visual clarity |

