

# What's actually still broken

After verification: **most of the previous "broken" claims were stale.** The real outstanding work is small but high-impact.

## Verified DB state
- 283 active nurture / 40 with d45+ tasks ✅ (the rest are correctly <d30, no task needed)
- 44 discovery-stuck → 44 triage tasks ✅
- 151 SLA tasks live ✅
- 0 legacy stages in DB ✅

## What's actually still wrong

### 1. The 91% drop-off — structurally unsolved
Pipeline distribution today:
```
Unassigned          90
In Contact           1   ← bottleneck
Discovery Scheduled 11
Discovery Completed 44   ← graveyard (now has triage tasks, but stage still empty downstream)
Sample Sent          0   ← the entire reason for the rebuild
Proposal Sent        4
Closed Won           4 / Closed Lost 283
```
No deal has ever passed through Sample Sent. The rebuild was supposed to make Sample Sent the make-or-break gate, but no automation pushes deals into it. The triage task is there but it's a passive todo.

### 2. Eight files still use legacy literals — silently miscount 283 closed-lost deals
- `src/components/Dashboard.tsx` (lines 35, 266, 800–801) — `ACTIVE_STAGES` is the legacy 8 stages; `qualifiedStages` set excludes "Sample Sent"; drill-down filter uses `["Closed Won","Lost","Went Dark"]`
- `src/components/DashboardBusiness.tsx` (lines 128–131, 366, 408, 530, 549, 720, 786, 868) — every win/loss aggregation uses `=== "Lost"` literals
- `src/components/DashboardForecast.tsx` (lines 34, 683)
- `src/components/DashboardOperations.tsx` (line 27 `TERMINAL_STAGES`, line 22 `ACTIVE_STAGES`)
- `src/components/DashboardAdvancedMetrics.tsx` (line 173 ACTIVE_STAGES)
- `src/components/IntelligenceCenter.tsx` (line 921 stage order)
- `src/components/dealroom/IdentityCard.tsx` (line 69)
- `src/components/command-center/FollowUpsTab.tsx` (lines 23–24, 31–36, 121, 724, 734)
- `src/components/command-center/ScheduleTab.tsx` (line 97)
- `src/components/Pipeline.tsx` (line 178, 182) — `sourceCoCount` uses `["Lost","Went Dark","Closed Won"]`; `newLeadCount` filters `=== "New Lead"`
- `src/components/PipelineFilters.tsx` (line 106 `forecastGap` lateStage list)
- `src/components/ActionQueue.tsx` (lines 83–85)
- `src/lib/newLeadUtils.ts` — entire helper checks `=== "New Lead"`

Net effect: every analytics card understates closed-lost performance by 283 leads, "stuck New Lead" badges show 0 instead of the 90 Unassigned, and SourceCo dossier counts ignore Sample Sent deals.

### 3. No auto-promotion from Discovery → Sample Sent / In Contact
There's no playbook task for "Unassigned → In Contact" (90 leads need first-touch beyond just the SLA email task), and no nudge at "Discovery Completed" to remind to actually send a sample.

---

## Plan: 3 fixes

### Fix 1 — Mechanical legacy-literal cleanup (12 files)
Replace every hardcoded stage list with the v2 helpers:
- `["Closed Won","Lost","Went Dark"]` → `isClosedStage(normalizeStage(s))`
- `=== "Lost"` / `=== "Went Dark"` → `normalizeStage(s) === "Closed Lost"`
- `=== "New Lead"` → `=== "Unassigned"` (DB only has Unassigned now)
- `=== "Meeting Held"` → `=== "Discovery Completed"`
- `ACTIVE_STAGES` literals → import `ACTIVE_STAGES` from `@/lib/leadUtils`
- Stage-order arrays for sorting → use `ALL_STAGES`
- `lateStage` lists in `PipelineFilters.forecastGap` → `["Discovery Completed","Sample Sent","Proposal Sent","Negotiating"]`

Files touched: `Dashboard.tsx`, `DashboardBusiness.tsx`, `DashboardForecast.tsx`, `DashboardOperations.tsx`, `DashboardAdvancedMetrics.tsx`, `IntelligenceCenter.tsx`, `IdentityCard.tsx`, `FollowUpsTab.tsx`, `ScheduleTab.tsx`, `Pipeline.tsx`, `PipelineFilters.tsx`, `ActionQueue.tsx`, `newLeadUtils.ts`.

### Fix 2 — `discovery-completed-no-sample` SLA rule
Add to `enforce-stage-slas/index.ts`:
- Stage `Discovery Completed`, threshold 5 days, taskType `email`
- Title: "Send sample or push to Closed Lost — no more graveyard"
- Result: the 44 stuck deals get a hard SLA task on top of the soft triage task; refusing to act becomes visible operationally.

Also add `in-contact-stale` rule:
- Stage `In Contact`, threshold 4 days, taskType `call`
- Title: "Book the discovery — In Contact deal cooling"
- Forces the In Contact bottleneck to clear.

Then invoke once to seed against current state.

### Fix 3 — Update `getPlaybookForStage` so `Unassigned` and `In Contact` have playbooks
Right now `LeadContext.updateLead` calls `getPlaybookForStage` on stage change but `playbooks.ts` has no entry for `Unassigned` or `In Contact`. Add:
- **Unassigned**: 1 task — "Personalize first outreach + send within 24h" (due tomorrow)
- **In Contact**: 2 tasks — "Send Calendly link" (today), "Follow up if no booking" (day +3)

---

## Out of scope (intentionally)
- The mass `LEGACY_STAGES` array in `leadUtils.ts` and `STAGE_LABEL_MAP` — both kept for migration safety
- `dealPredictions.ts` and `meetingCoach.ts` legacy aliases — they intentionally fall back to legacy labels for old data
- Email sync work — comes after this batch

## Ship order
**Fix 1 (literals) → Fix 2 (SLA rules) → Fix 3 (playbooks for Unassigned/In Contact)**

After this, the rebuild is structurally + analytically + operationally complete. Then we move to email sync.

