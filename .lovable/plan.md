

# Merge Deal Room → Lead Panel. Make the panel the single record view.

## The realization
The Deal Room (`/deal/:id`) and the new HubSpot-style Lead Panel are now **~85% the same screen** — same three-column layout, same QuickActionBar, same RightRailCards, same UnifiedTimeline, same MeetingsSection, same EmailsSection. Maintaining both is duplication. We pick **one canonical record view**, and per HubSpot's pattern, that's the **panel** — opens from any context (pipeline, action queue, Cmd+K, dashboard) without losing your place.

Plus — per your screenshot and the HubSpot reference — **"Deal Management" (stage / priority / forecast / ICP / owner / service / deal value / pre-screen) is editorial CRM data, not the headline**. HubSpot keeps it in the **left rail "Key Information" card**, inline-editable. The center column is reserved for the **story of the deal** (activity, meetings, emails, intelligence).

## What we're doing

### 1. Make the panel the canonical view; retire the Deal Room as a separate page
- `/deal/:id` route still exists, but renders `LeadDetailPanel` in **full-screen mode** (no Sheet wrapper, just the same workspace inline). Direct links keep working, refreshes work, "Open Deal Room" button stays meaningful — but it's literally the same component, just mounted differently.
- Old `src/pages/DealRoom.tsx` (~1180 lines) is deleted. Everything unique to it (Actions tab with priority queue + draft cards + objections, Debrief tab for closed deals, prep brief dialog, LinkedIn override) gets **moved into the panel**.
- Net effect: one record view across the entire app. Edit it once, fix it everywhere.

### 2. Move Deal Management out of the center column
The center "Overview" tab is wrong for editing CRM fields. Restructure:

**Left rail → "Key Information" card becomes inline-editable** (HubSpot pattern):
Stage · Priority · Forecast · ICP Fit · Owner · Service · Deal Value · Pre-Screen · Subscription · Billing · Tier
Each field hover-to-edit, click-to-edit-inline. Same `Section/Field/SelectField` primitives, just compacted into the rail.

**Left rail → New "Dates" card (collapsible):**
Contract Start · Contract End · Close Date · Forecast Close · Meeting Date · Next Follow-up · Last Contact

**Left rail → "Won/Lost details" card (only when stage is closed):**
Close Reason · Won/Lost reason text

This kills the giant middle "Deal Management / Revenue & Contract / Meeting / Tracking" form blocks. The center is now reserved for content, not chrome.

### 3. New center tabs (final set)

| Tab | Purpose |
|---|---|
| **Activity** *(default)* | UnifiedTimeline — meetings + emails + stage + Calendly + submissions + notes, with filter chips |
| **Actions** *(hidden when closed)* | Full priority queue from Deal Room — Next Best Action, Priority Actions, Waiting on Them, Objections + won-deal playbook, Strategic, Completed (inline draft cards w/ save/regen/discard, persists to `lead_drafts`) |
| **Meetings** | `MeetingsSection` |
| **Emails** | `EmailsSection` |
| **Intelligence** | `DealIntelligencePanel` |
| **Files** | Drive folder + Fireflies recordings aggregator |
| **Notes** | Textarea (append-with-timestamp button writes to activity log) |
| **Debrief** *(closed only)* | Win/Loss debrief screen from Deal Room |

**Removed:** the standalone "Overview" tab — its fields move to the left rail, its alerts (DealHealthAlerts banner) move to the **top of the Activity tab** as a sticky banner where they're actually noticed, and its AI Suggestions / Auto-Find / External Research move into a **collapsible "AI Insights" card in the right rail** (top, above Deal Health) so it's always visible without dominating the center.

### 4. Right rail additions
Add what we have but never surfaced:
- **AI Insights** *(new, top)* — Research & Recommend button, suggested updates, auto-find suggestions, dossier (collapsed). Surfaces the value without screaming.
- **Open Commitments** (already there)
- **Stakeholders / Risks / Win Strategy / Buying Committee / Similar Won / Deal Narrative** (already there)
- **Submission History** *(new)* — multi-form submitters card, was orphaned in old code

### 5. Header polish
- Drop the "Deal Room ↗" link button (no longer separate destination)
- Add the **expand-to-fullscreen toggle** for users who want the panel to take the page (when launched from Sheet context, this is the route push to `/deal/:id`)
- Keep prev/next deal navigation, archive, enrich, more menu

### 6. Quick action bar — fully wire what's stubbed
- **Email** → opens compose dialog that saves to `lead_drafts` + jumps to Emails tab
- **Schedule** → if Calendly already booked, deep-link the meeting; else open Calendly
- **Note** → inline timestamped append (already wired)
- **Task** → inline-prompt → insert into `lead_tasks` (already wired)
- **Draft AI** → triggers next-best-action draft, opens Actions tab on the resulting card (already wired in DealRoom logic — port it)
- **Log Call** → small dialog (date · duration · outcome · summary) → writes `lead_activity_log` row of category `call`
- **Enrich** → existing Research & Recommend (already wired)

## Files touched

**Delete:**
- `src/pages/DealRoom.tsx` (~1180 lines, all logic moved into panel/lead-panel/*)

**Major rewrite:**
- `src/components/LeadDetailPanel.tsx` — supports two render modes: `mode="sheet"` (default, modal overlay) and `mode="page"` (mounted directly, used by `/deal/:id` route). Adds Actions tab, Debrief tab, prep brief dialog wiring. Drops the Overview tab.
- `src/App.tsx` — `/deal/:id` route now renders `<LeadDetailRoute />` wrapper that mounts `LeadDetailPanel` in page mode

**Refactor (move logic out of old DealRoom):**
- `src/components/lead-panel/LeadActionsTab.tsx` — *new* — entire priority/waiting/objections/strategic queue with draft cards (DraftCard component moves here)
- `src/components/lead-panel/LeadDebriefTab.tsx` — *new* — closed-deal win/loss debrief
- `src/components/lead-panel/LeadPanelLeftRail.tsx` — KeyInformationCard becomes inline-editable; add Dates card, Won/Lost card, LinkedIn override (when missing)
- `src/components/lead-panel/LeadPanelRightRail.tsx` — adds **AI Insights** card at top (Research, Suggested Updates, Auto-Find), adds Submission History card
- `src/components/dealroom/KeyInformationCard.tsx` — convert read-only Field components to inline-editable variants
- `src/components/dealroom/RightRailCards.tsx` — accept new "AI Insights" props; surface even when empty (with CTA)

**Update existing inline-edit primitive in `lead-panel/shared.tsx`:**
- New `InlineEditField`, `InlineSelectField`, `InlineDateField`, `InlineNumberField` — hover → pencil, click → inline editor → blur saves. Same monochrome aesthetic.

**Delete:**
- `src/components/lead-panel/LeadOverviewTab.tsx` (its content disperses to left rail + activity banner + right rail)
- `src/components/lead-panel/LeadActivityTab.tsx` is kept but gets a `DealHealthAlerts` banner above the timeline

**Untouched:**
- `LeadContext`, all data plumbing
- `MeetingsSection`, `EmailsSection`, `DealIntelligencePanel`, `EmailMetricsCard`
- All edge functions, types, DB schema
- All 6 import sites — they still call `<LeadDetail leadId open onClose />` and get the new panel

## Risk + mitigation
- **`/deal/:id` URLs already shared/bookmarked** → still resolve, render the same content in page mode. No 404s, no redirects.
- **Pipeline cards link to `/deal/:id?tab=actions`** → still works (same tab system).
- **Inline editing across left rail** is new pattern in this codebase — use a single `InlineEditField` primitive so behavior is consistent, monochrome only, escape-to-cancel, enter-to-save.
- **The Actions tab is the most complex piece** (~600 lines of priority/objection/draft logic) — port verbatim from DealRoom into `LeadActionsTab.tsx`, no behavior changes. It already works.

## What we explicitly defer (documenting only, not building now)
- Field-level audit log ("Stage changed by X on Y")
- Per-rep "follow this lead" notification toggle
- Drag-to-reorder right-rail cards per user preference
- Inline associated-companies card (we have the data via `getCompanyAssociates`)
- "Pin activity to top" of timeline

