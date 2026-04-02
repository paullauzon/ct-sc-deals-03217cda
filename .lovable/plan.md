

# Command Center Audit — Remaining Issues

## Current State
All 4 tabs render without errors. The Follow-Ups tab was recently redesigned with rich rows, sort controls, and AI action chips. Schedule, Deal Pulse, and Prep Intel are functional. Below is everything still needing work.

---

## Bugs & Issues

### 1. Prep Intel: Cards are bare — no intelligence displayed
The Prep Intel tab shows 3 upcoming meetings but only displays name, role, company, stage, and date. The `IntelCard` component has rich sections (Win Strategy, Psychological Profile, Enrichment, Objections, Action Items, Risks, Deal Narrative) but none of it renders because these leads don't have `dealIntelligence` or `enrichment` populated yet. The cards look empty and uninformative.

**Fix**: Show whatever data IS available — Calendly event details, deal value, meeting count, email history. When no deep intelligence exists, show a "Generate prep brief" action button that calls `generate-meeting-prep`.

### 2. Prep Intel: Horizon toggle doesn't sync with Schedule tab
The Schedule tab has its own internal `meetingHorizon` state (line 247 of ScheduleTab). The ActionQueue also has a `meetingHorizon` state (line 47) that is only shown when `commandTab === "schedule" || commandTab === "intel"`. But the Schedule tab ignores the parent's horizon — it manages its own. So the top-level 7d/14d/30d buttons affect Prep Intel but NOT Schedule.

**Fix**: Remove the internal `meetingHorizon` from ScheduleTab and pass it as a prop from ActionQueue, or remove the duplicate toggle from ActionQueue header.

### 3. Deal Pulse: Momentum Board shows "New Lead" entries with 100+ day counts
The board includes leads in "New Lead" stage with 150d, 140d etc. These aren't real "deals" — they're untouched leads polluting the momentum board. The `ACTIVE_STAGES` set excludes "New Lead" but `activeDeals` on line 54 explicitly adds `|| l.stage === "New Lead"`.

**Fix**: Remove `|| l.stage === "New Lead"` from `activeDeals` filter on DealPulseTab line 54. New Leads should only appear in Follow-Ups tab.

### 4. Deal Pulse: Pipeline Velocity shows "Meeting Held" at 16d avg across 70 deals
This number seems inflated — 70 deals in "Meeting Held" suggests leads are getting stuck there. The velocity display doesn't indicate whether this is healthy or problematic.

**Fix**: Add color coding that matches `daysInStageColor` to velocity cards (already partially done) and add a "benchmark" indicator.

### 5. Follow-Ups: "Copy to Clipboard" doesn't separate subject line for email drafts
When the AI generates an email (subject on line 1, body after blank line), the copy button copies raw text. No "Copy as Email" option that separates subject from body.

**Fix**: Add a secondary "Copy Subject + Body" that splits on first double-newline.

### 6. Schedule Tab: Duplicate horizon toggle
The Schedule tab has its own 7d/14d/30d toggle inside the "Upcoming Meetings" section header (line 300-306). The ActionQueue header ALSO shows a horizon toggle when on the schedule tab (line 131-143). This is confusing — two independent horizon controls.

**Fix**: Remove the ActionQueue header toggle for the schedule tab (keep it only for intel), or wire them together.

### 7. Follow-Ups: No total count per section visible at top level
The top says "98 items needing action" but there's no quick breakdown. User has to expand each section to see counts.

**Fix**: Add a summary strip like Schedule tab has (e.g., "78 Overdue · 3 Due This Week · 5 Unanswered · 10 Untouched · 2 Going Dark").

### 8. Edge Function: `lastEmail` field name mismatch
The edge function reads `lastEmail.fromName` and `lastEmail.fromAddress` (lines 144-145) but the Supabase query returns `from_name` and `from_address` (snake_case). The Supabase JS client auto-converts to camelCase, so this actually works. No issue.

### 9. Schedule Tab: `buildActionItems` is exported but not imported in ActionQueue
Confirmed: ActionQueue line 10 no longer imports `buildActionItems` — this was already fixed in the last edit. No issue.

---

## Design & UX Improvements

### A. Prep Intel cards need more substance
Currently the simplest-looking tab despite being the most strategically important. Cards should show:
- Calendly event name and duration
- Number of prior meetings with this lead
- Email exchange count
- A "Generate Prep Brief" button if no intelligence exists
- Prior meeting summaries if available

### B. Deal Pulse: Momentum Board needs sorting/filtering
Currently sorted by risk score (stalled deals first) but no user control. Should add sort toggles like Follow-Ups tab has (by Value, Days, Stage, Temperature).

### C. Follow-Ups: Action chip label is always "Follow Up" for Meeting Held leads
Every Meeting Held lead shows the same "Follow Up" chip. Should differentiate based on context — if proposal-ready, show "Send Proposal"; if they have open action items, show "Complete Actions."

---

## Implementation Plan

| Priority | Fix | File |
|----------|-----|------|
| 1 | Remove "New Lead" from Deal Pulse activeDeals | `DealPulseTab.tsx` line 54 |
| 2 | Remove duplicate horizon toggle from ActionQueue header for schedule tab | `ActionQueue.tsx` line 131 |
| 3 | Add summary counts strip to Follow-Ups tab | `FollowUpsTab.tsx` |
| 4 | Enrich Prep Intel cards with Calendly details, meeting count, email count, and "Generate Brief" button | `PrepIntelTab.tsx` |
| 5 | Add sort controls to Momentum Board | `DealPulseTab.tsx` |
| 6 | Add "Copy as Email" split option in Action Sheet | `FollowUpsTab.tsx` |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/DealPulseTab.tsx` | Remove New Lead from activeDeals; add sort controls to Momentum Board |
| `src/components/ActionQueue.tsx` | Show horizon toggle only for intel tab (not schedule, which has its own) |
| `src/components/command-center/FollowUpsTab.tsx` | Add section summary strip; add "Copy as Email" |
| `src/components/command-center/PrepIntelTab.tsx` | Enrich cards with Calendly, email counts, meeting history; add "Generate Brief" button |

