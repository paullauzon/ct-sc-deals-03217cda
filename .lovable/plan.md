

## Right rail redesign — wireframe-driven Deal Snapshot

### What the wireframe actually is
A consolidated **right-rail deal card** with 6 stacked sections that summarize the deal at-a-glance:

1. **Deal Headline** — Company + brand stripe, $value/mo, current stage + "Stage X of 9" with a colored progress bar, brand chip, service chip, owner chip
2. **Deal Snapshot** (key facts table) — Pipeline name, deal amount, est. close, create date, days in stage, intro/discovery/sample dates, sample outcome, competing against, decision blocker, stall reason, budget/authority confirmed, subscription tier, Fireflies link, Drive link
3. **Pipeline stages** (vertical checklist) — All 9 active stages with ✓ checks, "← you are here" highlight, and the **Closed Won handoff hint** ("auto-creates deal in Valeria's pipeline at Onboarding")
4. **Deal health score** (collapsed by default — already implemented, just kept here)
5. **Signals** count badge (collapsed) — surfaces alert count from `DealHealthAlerts`
6. **Open tasks** with `+ Add` button (collapsed) — count from `lead_tasks`
7. **Associated company** card — Firm name, type, AUM, active searches, contacts at firm, website link
8. **Stakeholders at this firm** — already exists as `StakeholderCard`, relocated here
9. **Fireflies recordings** — list of meetings with transcript links
10. **Attachments** — Drive link + meeting attachments

### Stage mapping — wireframe (9 stages) → our actual pipeline
Wireframe shows a generic 9-stage list. Our actual ACTIVE_STAGES are 8, plus terminal stages. The vertical checklist will use **our 12 stages**, grouped:

```
Active (1-8)              Nurture/Terminal (9-12)
1. New Lead               9.  Revisit/Reconnect (gray)
2. Qualified              10. Closed Won (emerald)
3. Contacted              11. Lost (muted)
4. Meeting Set            12. Went Dark (muted)
5. Meeting Held
6. Proposal Sent
7. Negotiation
8. Contract Sent
```

Active stages get the green ✓ if `ACTIVE_STAGES.indexOf(stage) > currentIdx` is false. "← you are here" amber highlight on current. Terminal stages render below a divider, dimmed unless current.

The "Stage X of 9" header text becomes "Stage X of 8" for active deals, or "Closed" / "Lost" / "Went Dark" / "Nurture" for non-active.

### What exists vs. what's new

**Reuse as-is (just relocate to right rail):**
- `RightRailCards` (Deal Health) — keep
- `StakeholderCard` — move from left/intelligence rail to right rail
- `DealHealthAlerts` from `shared.tsx` — surface as "Signals" count

**New components (4):**
- `DealSnapshotCard.tsx` — headline + snapshot table (sections 1+2 above). Pulls from `lead.subscriptionValue`, `stage`, `forecastedCloseDate`, `created_at`, `daysInStage`, `meetingSetDate`, `meetingDate`, `sampleSentDate`, `sampleOutcome`, `competingAgainst`, `decisionBlocker`, `stallReason`, `budgetConfirmed`, `authorityConfirmed`, `tier`, `firefliesUrl`, `googleDriveLink`. Inline-editable for the manual fields (reusing `InlineTextField`/`InlineSelectField`).
- `PipelineStagesCard.tsx` — vertical 12-stage checklist with click-to-jump, "you are here" highlight, and the **Closed Won handoff hint** as a tinted callout below the list.
- `AssociatedCompanyCard.tsx` — firm name + type + AUM + active searches + stakeholder count + website link. Uses `lead.company`, `lead.companyUrl`, `lead.firmAum`, `lead.activeSearches`, derived firm type, and stakeholder count from `lead_stakeholders`.
- `OpenTasksCard.tsx` — count of pending `lead_tasks` with "+ Add" button that opens existing `TaskDialog`. List collapsed by default; expand to show top 3.

**New lightweight section** (no new component, inline in `LeadPanelRightRail.tsx`):
- `FirefliesRecordingsCard` — list `lead.meetings` filtered to those with `firefliesUrl`, with date + duration + attendees, click → opens transcript.
- `AttachmentsCard` — `googleDriveLink` row + `lead.meetings[*].attachments` aggregated with file icon + size + uploader.

### Right rail final structure (top → bottom)

```
[ Deal Headline + brand stripe + progress bar ]   ← DealSnapshotCard (header part)
[ Deal Snapshot table (~16 rows, dense) ]         ← DealSnapshotCard (table part)
[ Pipeline Stages checklist + Closed-Won hint ]   ← PipelineStagesCard
─────────────────────────────────────────────
[ Deal health score ▼ (collapsed) ]               ← existing RightRailCards
[ Signals (3) ▼ (collapsed) ]                     ← new SignalsCard wrapping DealHealthAlerts
[ Open tasks (2) + Add ▼ (collapsed) ]            ← OpenTasksCard
─────────────────────────────────────────────
[ Associated company card ]                       ← AssociatedCompanyCard
[ Stakeholders at this firm (3) ]                 ← StakeholderCard (relocated)
[ Fireflies recordings (2) ]                      ← inline render
[ Attachments (3) ]                               ← inline render
[ Forecast (kept) ]                               ← existing ForecastCard
[ Linked Account (when Closed Won) ]              ← existing LinkedAccountCard
```

### Width + interaction
- Bump right rail width from `w-[280px]` → `w-[340px]` to fit the snapshot table without truncation (still narrower than left rail's 320px? matches HubSpot pattern — bump to **320px** to match left for visual symmetry).
- All snapshot fields are **inline-editable** where they map to lead fields. Read-only computed values (days in stage, stage X of 8) are not editable.
- Pipeline stages clickable → uses existing `onChangeStage` → reuses the `closeWonGuard` pre-flight modal already in `LeadPanelHeader`. To avoid duplicating the modal, `PipelineStagesCard` emits a custom event `request-stage-change` that `LeadPanelHeader` listens to and routes through its existing `handleStageClick`.
- "+ Add" task button dispatches existing `onTask` from the panel.
- Fireflies link → opens the existing `TranscriptDrawer`.
- Drive link → opens in new tab.

### Dependencies & interconnection
- **Lead context:** all reads via `lead.*` already in `LeadContext`
- **Stage progress:** uses same `ACTIVE_STAGES` constant from `LeadPanelHeader.tsx` — extract to `src/lib/leadUtils.ts` so both consume one source of truth
- **Closed Won handoff:** the hint callout in `PipelineStagesCard` references the existing trigger + `LinkedAccountCard` — when the lead becomes Closed Won, the existing `LinkedAccountCard` auto-renders below in the same rail, so the hint becomes self-fulfilling
- **Tasks:** uses existing `useLeadTasks([lead.id])` for the count
- **Stakeholders count:** subscribed real-time via existing `lead_stakeholders` query in `StakeholderCard`; `AssociatedCompanyCard` reuses the same fetch via a small shared hook `useStakeholderCount(leadId)` to avoid double-fetching
- **Signals count:** computed from same alerts logic as `DealHealthAlerts` — extract a `getDealSignals(lead)` helper from `shared.tsx` so both the inline alerts (top of activity tab) and the right-rail Signals card use one source

### Files

**New**
- `src/components/lead-panel/cards/DealSnapshotCard.tsx`
- `src/components/lead-panel/cards/PipelineStagesCard.tsx`
- `src/components/lead-panel/cards/AssociatedCompanyCard.tsx`
- `src/components/lead-panel/cards/OpenTasksCard.tsx`
- `src/components/lead-panel/cards/FirefliesRecordingsCard.tsx`
- `src/components/lead-panel/cards/AttachmentsCard.tsx`
- `src/components/lead-panel/cards/SignalsCard.tsx`
- `src/hooks/useStakeholderCount.ts`

**Modified**
- `src/components/lead-panel/LeadPanelRightRail.tsx` — replace with the new stacked layout above
- `src/components/lead-panel/LeadPanelHeader.tsx` — listen for `request-stage-change` custom event, route through existing guard
- `src/components/lead-panel/shared.tsx` — extract `getDealSignals(lead)` for shared use
- `src/lib/leadUtils.ts` — export `ACTIVE_STAGES` constant

### Trade-offs
- **Win:** A scannable, comprehensive deal snapshot matching the wireframe — replaces today's barebones right rail (just Deal Health + Forecast + LinkedAccount) with a HubSpot-grade summary that surfaces ~25 fields without leaving the rail.
- **Risk:** The right rail becomes information-dense. Mitigated by collapsing the bottom 4 sections by default (Health, Signals, Tasks, Stakeholders/Company/Fireflies/Attachments visible expanded only when relevant).
- **Possible duplication:** Some fields in the snapshot table (subscription, dates) also live in the left rail's Key Information / Dates cards. Acceptable — wireframe explicitly shows them in the right rail as a "deal at a glance." Left rail remains the **edit surface**, right rail becomes the **read-first surface** with optional inline edit.
- **Mobile:** Right rail will be even denser; existing collapse toggle (`rightOpen`) stays so users can hide it.

### Verification
1. Open any active lead → right rail shows Deal Snapshot header with $value/mo + "Stage X of 8" + colored progress bar
2. Snapshot table shows ~16 rows; click any value → enters edit mode
3. Pipeline Stages list shows all 12 stages with current one highlighted; click a different stage → triggers existing stage-change modal flow (with Closed Won billing guard)
4. Closed Won hint callout visible below the stage list for non-Closed-Won deals
5. Open a Closed Won lead → hint hides, Linked Account card appears at bottom of rail
6. Signals badge count matches the count of `DealHealthAlerts` shown in Activity tab
7. Open tasks count matches pending `lead_tasks` for the lead; "+ Add" opens TaskDialog
8. Fireflies card lists meetings with transcripts; clicking opens the transcript drawer
9. Stakeholders card shows the same data as today (relocated, not duplicated — removed from prior location if present)

