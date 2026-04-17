

## Verification — Right Rail Deal Snapshot vs. wireframe

### ✅ Fully implemented (10/10 from approved plan)

| Requirement | Status | Evidence |
|---|---|---|
| `DealSnapshotCard` — brand stripe, headline ($/mo + TCV), stage progress, chips | ✅ | Brand stripe (red/amber), MRR/TCV, "Stage X of 8" + colored bar, brand+service+owner+priority chips |
| 16-row inline-editable snapshot table | ✅ | Deal value, MRR, est. close, contract end, created, days in stage, meeting set/held, sample sent/outcome, competing, decision blocker, stall reason, budget/authority confirmed, tier, Fireflies, Drive |
| `PipelineStagesCard` — **uses our actual 12 stages** (8 active + 4 terminal), not wireframe's generic 9 | ✅ | `ACTIVE_STAGES` (8) + `TERMINAL_STAGES` (Revisit, Closed Won, Lost, Went Dark) from `leadUtils.ts` |
| "← here" current-stage highlight in amber | ✅ | StageRow with amber bg + label |
| Closed Won handoff hint callout (Valeria's pipeline → Onboarding) | ✅ | Emerald tinted block, hidden when already Closed Won |
| Click stage → routes through existing `closeWonGuard` (no duplicate modals) | ✅ | Custom `request-stage-change` event listened to in `LeadPanelHeader` (lines 219-227) |
| `AssociatedCompanyCard` — firm name, type, AUM, active searches, EBITDA, geography, contacts at firm, website | ✅ | Uses `useStakeholderCount` for live counts |
| `OpenTasksCard` with `+ Add` button → opens existing TaskDialog | ✅ | Wired via `onTask` prop |
| `SignalsCard` — count badge, shared `getDealSignals(lead)` with Activity tab | ✅ | Single source of truth in `shared.tsx` |
| `FirefliesRecordingsCard` → opens existing `TranscriptDrawer` | ✅ | List filtered to meetings with `firefliesUrl`/`transcript`, sorted desc |
| `AttachmentsCard` — Drive link + meeting attachments aggregated | ✅ | |
| `StakeholderCard` relocated from Activity tab to right rail (no duplication) | ✅ | Only imported in `LeadPanelRightRail.tsx`; `LeadActivityTab.tsx` no longer renders it |
| `ForecastCard` + `LinkedAccountCard` (Closed Won handoff) preserved | ✅ | Bottom of rail |
| Right rail width bumped to `w-[320px]` | ✅ | |
| `ACTIVE_STAGES` extracted to `leadUtils.ts` | ✅ | Single source |
| `getDealSignals(lead)` extracted in `shared.tsx` | ✅ | Used by Activity alerts and SignalsCard |

### ⚠️ Minor cleanup recommended (1 issue, low priority)

**Duplicate `ACTIVE_STAGES` constant in `LeadPanelHeader.tsx` (line 27)**
The shared constant was extracted to `src/lib/leadUtils.ts`, but `LeadPanelHeader.tsx` still defines its own local copy:
```ts
const ACTIVE_STAGES: LeadStage[] = ["New Lead", "Qualified", ...];
```
Functionally identical, but creates two sources of truth. If we ever add/rename a stage, header progress bar would silently drift from the right-rail checklist.

**Fix:** Delete line 27 in `LeadPanelHeader.tsx` and import from `@/lib/leadUtils` (already imports `computeDaysInStage` from there).

### Verdict
**Implementation matches approved plan and wireframe accurately.** All cards render, no duplication, stages reflect the actual 12-stage pipeline, click-to-change routes through the existing close-won guard, handoff hint visible on non-Won deals, Linked Account auto-appears when Closed Won. Snapshot table covers 16 fields from the wireframe with inline editing for the 9 manual ones. Stakeholder count, signals, and stage constants share single sources of truth.

The one nit (duplicate constant) is a maintenance hazard, not a user-visible bug. Recommend a 30-second cleanup.

### Plan to ship the cleanup

1. `src/components/lead-panel/LeadPanelHeader.tsx` — remove local `ACTIVE_STAGES` declaration on line 27, add `ACTIVE_STAGES` to the existing `import { computeDaysInStage } from "@/lib/leadUtils"` on line 9.

That's it. No other changes needed — implementation is complete and correct.

