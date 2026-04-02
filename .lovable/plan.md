

# Command Center — Final Status Report

## What's Working Well (Verified)
- **Schedule**: Morning briefing, 3 meeting cards (2 today, 1 in 6d), horizon toggle synced, priority tiers with blue "Due today" styling, summary stats
- **Follow-Ups**: Rich rows with context signals, batch snooze (>30d, >14d), sort controls, AI action chips (Send Proposal, Follow Up, etc.), summary strip with section counts, unanswered inbound detection, AI Action Sheet with "Copy & Mark Done"
- **Deal Pulse**: 4 KPIs, forecast strip, momentum board with "Has Intel" toggle (81 deals with intel), sort controls, velocity cards with benchmarks, renewals section
- **Prep Intel**: 3 cards with Calendly details, "Research Prospect" for 0-meeting leads, "Draft Pre-Meeting Email" button, prospect messages, company descriptions, context grid
- **Badge counts**: Schedule=2, Follow-Ups=78 (overdue-only), Deal Pulse=27, Prep Intel=3
- **Edge functions**: All 3 AI functions on gpt-4o

## What's Actually Still Wrong

### 1. Follow-Ups Badge Shows 78 — Still Too High
The badge shows 78 which is the full overdue count. The plan said to cap at "overdue-only" which was done, but 78 is still overwhelming. The original plan suggested filtering to only items overdue by 7 days or fewer for an "actionable backlog" count.

**Fix**: In `ActionQueue.tsx`, filter overdue to only count items where `daysOverdue <= 7` for the badge. This gives a meaningful "needs attention THIS WEEK" number instead of the full historical backlog.

### 2. Batch Snooze Shows "Snooze >30d (0)" — Zero Items
The batch snooze bar shows "Snooze >30d (0)" because no items are >30 days overdue (max is ~25d based on the data). The >14d button shows 25 items. Having a button with "(0)" looks broken.

**Fix**: Only render a batch button if its count is > 0. Simple conditional rendering.

### 3. Deal Pulse: "Has Intel (81)" Toggle Label is Misleading
81 of 109 deals show as "Has Intel" but most still show "—" for Temp and Momentum columns. The `dealIntelligence` JSONB field exists but may contain only partial data (e.g., `actionItemTracker` but no `winStrategy`). The filter checks `!!lead.dealIntelligence` which is true for any non-null JSONB, even empty objects.

**Fix**: Tighten the filter to check for meaningful intel: `lead.dealIntelligence?.winStrategy?.dealTemperature || lead.dealIntelligence?.momentumSignals?.momentum` — this filters to deals that actually have visible Temp/Momentum data.

### 4. Prep Intel: "Draft Pre-Meeting Email" Regenerate Button Causes Double Loading
In the Draft Email Sheet, clicking "Regenerate" calls `handleDraftEmail(draftLead!)` which sets `draftLoading = true` internally, but the onClick also sets `setDraftLoading(true)` — causing a race condition. The `.finally(() => setDraftLoading(false))` fires from the outer handler while the inner `handleDraftEmail` also manages loading state.

**Fix**: Remove the redundant `setDraftLoading(true)` from the Regenerate button onClick. Just call `handleDraftEmail(draftLead!)` which handles its own loading state.

### 5. Follow-Ups: Summary Strip Missing "Unanswered" Count
The summary strip shows "77 Overdue · 5 Due This Week · 10 Untouched · 6 Going Dark" — the unanswered inbound count IS shown (visible as purple "Unanswered" text in the strip). This is working correctly now.

### 6. Schedule: "Due today" Still Appears in Overdue Color When Text Says "Due today"
Looking at the Schedule screenshot, Peter Wylie shows "Due today" in blue — this is fixed and working correctly.

---

## Remaining Items (Not Yet Built from Original Vision)

### 7. No Automated Follow-Up Task Templates
The original prompt asked: "let's define follow up tasks, follow up call, follow up email and anything else that should happen after each action — after they scheduled a meeting, after they took a meeting, if they didn't book at all." 

Currently the AI Action Sheet generates a single draft per action. There is no **automated task sequence** — e.g., after "Meeting Set", the system should auto-create a sequence: "Send confirmation email (day 0) → Send prep agenda (day -1) → Post-meeting follow-up (day +1)". This was discussed in early plans but never implemented.

**Status**: This is a larger feature (task sequencing / playbook automation). Not a bug — a feature gap. Would require a new `lead_tasks` table and UI for managing task sequences.

### 8. No "Open Deal Room" Quick Action on Prep Intel Cards
The plan mentioned adding a quick-access link to the Deal Room from Prep Intel cards. Currently you can only click the card to open the lead detail panel.

**Fix**: Add a small "Deal Room" link/button on Prep Intel cards that navigates to `/deal-room/{leadId}`.

---

## Priority Implementation (3 Fixes)

| # | Fix | File | Impact |
|---|-----|------|--------|
| 1 | Tighten "Has Intel" filter to check for actual Temp/Momentum data | `DealPulseTab.tsx` | UX — 81 is misleading |
| 2 | Hide batch snooze buttons with 0 count | `FollowUpsTab.tsx` | Visual polish |
| 3 | Fix Regenerate double-loading in Prep Intel draft sheet | `PrepIntelTab.tsx` | Bug fix |

### Optional Enhancements

| # | Enhancement | File | Impact |
|---|------------|------|--------|
| 4 | Reduce Follow-Ups badge to 7-day overdue window | `ActionQueue.tsx` | UX — 78 is still overwhelming |
| 5 | Add "Deal Room" link to Prep Intel cards | `PrepIntelTab.tsx` | Quick access |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/DealPulseTab.tsx` | Filter "Has Intel" by `winStrategy.dealTemperature` or `momentumSignals.momentum` instead of just `!!dealIntelligence` |
| `src/components/command-center/FollowUpsTab.tsx` | Conditionally render batch snooze buttons only when count > 0 |
| `src/components/command-center/PrepIntelTab.tsx` | Remove redundant `setDraftLoading` from Regenerate onClick; optionally add Deal Room link |
| `src/components/ActionQueue.tsx` | Optionally filter badge to 7-day overdue window |

