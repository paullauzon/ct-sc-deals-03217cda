

# Finish the Lead Panel rebuild — surgical wrap-up

## What's actually broken right now
The new panel was built but **is not being used**. Two `LeadDetail` exports exist:
- `LeadsTable.tsx` line 96 — old 1500-line version (still wins because all 6 import sites pull from `@/components/LeadsTable`)
- `LeadDetailPanel.tsx` line 272 — new full-screen version (orphaned)

Result: every place that opens a lead — Pipeline, Leads, Dashboard, ActionQueue, IntelligenceCenter, BusinessSystem, Cmd+K — still shows the old 4xl Sheet. The user has not actually seen the new panel yet.

## Step 1 — wire up the new panel (the unblock)
In `src/components/LeadsTable.tsx`:
- **Delete** the old `LeadDetail` function (lines 96–~1024 — everything between `export function LeadDetail` and `export function LeadsTable`)
- **Re-export** `LeadDetail` from the new file at the top: `export { LeadDetail } from "./LeadDetailPanel"`
- Keep `LeadsTable` and all helpers it actually uses
- Verify the `<LeadDetail>` self-render at line 1528 still resolves

This single change activates the entire HubSpot rebuild for all 6 entry points.

## Step 2 — replace the stub Activity tab with real timeline
`LeadActivityTab.tsx` currently just renders `<UnifiedTimeline lead={lead} />` from the dealroom folder — that's actually fine and already merges meetings + emails + stage + Calendly + submissions. **Verify it works** inside the panel context (it's the same Lead object), no rebuild needed.

## Step 3 — fix hook-order bug
`LeadDetailPanel.tsx` calls `useEffect` (line 38) before the `if (!lead) return null` guard (line 40), but `useState` and `useCallback` come after. Move the early return **after** all hooks, or render an empty `<Sheet>` shell when `!lead` to keep hook order stable.

## Step 4 — fill remaining HubSpot-parity gaps
Surface what we have but never showed:

1. **Quick action bar wiring** — `onTask` currently just toasts "live in Deal Room". Wire it to actually create a row in `lead_tasks` via a small inline prompt (toast with input → insert). Same for `onLogCall` → write a `lead_activity_log` entry of type `manual_event` with category `call`.
2. **Notes tab** — currently a bare textarea. Add an "Append note" button that timestamps the entry and writes a synthetic `lead_activity_log` row so notes appear in the Activity timeline.
3. **Email quick-compose** — `onEmail` jumps to the Emails tab. Add a "Compose" CTA inside `EmailsSection` that opens a drawer writing to `lead_drafts` (drafting infra already exists via `draft-followup`).
4. **Stakeholders / Buying Committee panels in right rail** — confirm `RightRailCards` already renders these from `lead.dealIntelligence`. If a card is empty, show a one-line "Process meetings to surface" hint instead of hiding silently.
5. **Pre-Screen status visibility** — already in `KeyInformationCard`; verify the toggle propagates back to `save()`.

## Step 5 — investigate things that could still be done (not in v1)
Documenting for follow-up; **not building now**:
- Per-rep email connection UI (waiting on Outlook tenant approval)
- Inline call logging with duration + outcome dropdown
- "Pin" an activity to the top of the timeline (HubSpot pinned activity)
- Card customization per user (drag to reorder right-rail cards)
- Associated Companies card (right rail) — we already compute associates, could elevate to a top-level card

## Files touched
- `src/components/LeadsTable.tsx` — **major delete** (old LeadDetail removed), add re-export at top
- `src/components/LeadDetailPanel.tsx` — fix hook order, wire `onTask` + `onLogCall` + note-as-activity
- `src/components/lead-panel/LeadOverviewTab.tsx` — minor: ensure DealHealthAlerts visible
- `src/components/lead-panel/LeadPanelRightRail.tsx` — graceful empty-state hints

## What stays untouched
- All 6 import sites (Pipeline, ActionQueue, Dashboard, BusinessSystem, IntelligenceCenter, Index)
- `LeadContext`, edge functions, types, DB schema
- `MeetingsSection`, `EmailsSection`, `DealIntelligencePanel`, `EmailMetricsCard`, `UnifiedTimeline`

## Risk
The old `LeadDetail` in `LeadsTable.tsx` defines several helper components inline (`EnrichmentSection`, `ActivityTimeline`, `CompanyActivitySection`, `SubmissionHistory`, `AISuggestionsPanel`, `DealHealthAlerts`, `Section`, `Field`, `SelectField`, `ClearableSelectField`). The new panel already has its own copies in `lead-panel/shared.tsx`. Confirmed: nothing outside that file imports the inline helpers, so deletion is safe.

