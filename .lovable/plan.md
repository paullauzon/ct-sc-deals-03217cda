
# Pipeline rebuild — what's actually built vs. what's still broken

I audited the full system end-to-end: DB state, edge functions, cron jobs, every UI surface, and the `getCompanyAssociates`/playbook/SLA wiring. Here's the truth.

## What actually shipped (and works)

| Area | Status |
|---|---|
| 9-stage v2 type union + `normalizeStage()` | ✅ Live |
| `STAGE_GATES` definitions + `StageGateGuard` modal | ✅ Wired into LeadPanelHeader |
| Pipeline.tsx Kanban shows 9 columns incl. Sample Sent | ✅ Live |
| Right-rail `PipelineStagesCard` uses `ACTIVE_STAGES` v2 | ✅ Live |
| `enforce-stage-slas` cron (15-min) | ✅ Active, 14 SLA tasks created |
| `nurture-engine` cron (daily 13:00 UTC) | ✅ Active |
| `PipelineHealthV2` dashboard widget | ✅ Mounted under Dashboard → Pipeline tab |
| DB migration | ✅ All 459 leads on v2 stages — **zero legacy rows** |
| 471 v2 playbook tasks backfilled | ✅ Done |

## What's actually broken or unfinished

### 1. The migration UI is dead code (will never render)
DB query confirms: `legacy_stage_count = 0`. The 4-tab `PipelineMigrationPage` (BulkRenames, DeadStages, DiscoveryWorklist, RRTriage) was rendered obsolete the moment Phase 5's SQL migration ran. The page now always shows the "Migration complete" empty state. The nav link is hidden. **Dead code — should be deleted or repurposed.**

### 2. Nurture engine is silently broken — 0 nurture tasks created for 264 enrolled leads
- 264 leads have `nurture_sequence_status='needs_triage'` (set by the bulk SQL backfill, not 'active')
- 19 leads have `nurture_sequence_status='active'` — but they all have `nurture_started_at = today`, so day-0 milestones haven't fired
- The cron runs once daily at 13:00 UTC — it has run, but produced **0 tasks and 0 drafts**
- The `nurture-engine` function is checking only `'active'` status; the 264 `needs_triage` leads are invisible to it

### 3. The 91% drop-off problem is **completely unfixed** — only 1 deal in `In Contact`, 0 in `Sample Sent`
The structural change shipped, but no Discovery Completed deals (44 sitting at $217.8K) were ever moved through the new Sample Sent stage. The DiscoveryWorklistTab that would have triaged them is now unreachable.

### 4. 8 files still reference legacy stage names with no `normalizeStage()` wrapper
Hardcoded literals that break analytics/health for any deal stored on a legacy alias:
- `src/lib/dealHealthUtils.ts` — 6 references (`"Meeting Held"`, `"Negotiation"`, `"Contract Sent"`, `"New Lead"`, `"Qualified"`)
- `src/components/DashboardForecast.tsx` — full STAGE_WEIGHTS map keyed to legacy names; ignores Sample Sent entirely
- `src/components/Pipeline.tsx` lines 33, 117, 376–384 — close-won guard uses pre-v2 fields; `ClickableProgressBar` checks `["Closed Won", "Lost", "Went Dark"]` but DB only has `"Closed Lost"` now
- `src/data/leadData.ts` seed data — sets `stage: "New Lead"` (no longer in DB)
- 5 dashboard subcomponents I traced (Operations, PersonaMetrics, Competitive, Signal, Trends) — TBD scan

### 5. Pipeline.tsx drag-to-Closed-Won uses old gate, not StageGateGuard
Lines 376–384 still have a hand-rolled `closeWonGuard` checking `subscriptionValue` + `contractEnd`. The new `StageGateGuard` (with override audit trail) is only wired into `LeadPanelHeader.handleStageClick`. Dragging a card to Closed Won bypasses v2 gates entirely.

### 6. SLA badge wired but only 14 tasks live system-wide
Pipeline.tsx line 873 reads `slaTasks` correctly, but `enforce-stage-slas` only generated 14. Why: cron just started running today and most stuck deals don't yet have `stage_entered_date` set far enough back. Will populate naturally over time, but **a one-time backfill against `meeting_date` / `created_at` is missing.**

### 7. `getPlaybookForStage` not wired to auto-fire on stage change
The v2 playbooks exist in `src/lib/playbooks.ts` but I see no invocation in `LeadContext.updateLead()` or any stage-change handler that calls `generateTasksFromPlaybook()`. The 471 backfilled tasks were a one-shot from the edge function — **future stage changes won't auto-create the v2 playbook tasks**.

### 8. Dashboard widget hidden behind a tab that may not be discoverable
`PipelineHealthV2` lives at `Dashboard.tsx:636` inside `activeTab === "pipeline"` — fine if the Pipeline tab is the default or visible, otherwise users won't find it.

---

## Plan: 4 focused fixes to actually finish the job

### Fix 1 — Wake the nurture engine for the 264 graveyard deals
- Update the SQL migration: flip the 264 `needs_triage` leads to `'active'` with `nurture_started_at` set to their original `closed_date` (so day-0 emails fire immediately for ones already past day 0, day-30 fires for ones >30d in graveyard, etc.)
- Manually invoke `nurture-engine` once to backfill all milestone tasks/drafts retroactively
- Result: ~264 nurture tasks/drafts appear in Action Center, replacing the dead R/R queue

### Fix 2 — Wire v2 playbooks into stage transitions (the biggest miss)
- Add to `LeadContext.updateLead()`: when `stage` changes, call `getPlaybookForStage(newStage)` and `generateTasksFromPlaybook()`, supersede prior pending tasks of the old playbook
- Add migration to reuse existing `lead_tasks.playbook` field — already in place
- Result: every deal that moves into Sample Sent / Discovery Completed / Negotiating / etc. auto-gets its 3-7 step task sequence

### Fix 3 — Replace hand-rolled close-won guard in Pipeline.tsx with StageGateGuard
- Drop lines 373–386 close-won-only check
- Render `<StageGateGuard>` from drag-drop handler too (same modal already used in lead detail header)
- Update `ClickableProgressBar` closed-stage check to `TERMINAL_STAGES` from leadUtils
- Result: gate enforcement consistent everywhere a stage moves (drag, click, keyboard)

### Fix 4 — Normalize remaining legacy literals in 4 critical files
- `dealHealthUtils.ts`: wrap all stage comparisons in `normalizeStage()`; add Sample Sent to ACTIVE_STAGES set
- `DashboardForecast.tsx`: rebuild STAGE_WEIGHTS using the 9 v2 stages with weights from `dealPredictions.ts`; include Sample Sent at 0.50
- `Pipeline.tsx` `ClickableProgressBar` (line 33): use `TERMINAL_STAGES` instead of hardcoded `["Closed Won","Lost","Went Dark"]`
- `seed leadData.ts`: stage `"New Lead"` → `"Unassigned"` (only matters for fresh dev DBs, low priority)

### Fix 5 — Delete the obsolete migration UI
- Remove `src/components/migration/` (5 files), `PipelineMigrationPage` import in `Index.tsx`, the conditional nav entry
- Result: cleaner codebase; the v2 transition is permanently complete

---

## Suggested shipping order (single session)

1. **Fix 1** (nurture activation) — 1 SQL migration + 1 cron invoke. Highest user value: 264 dead deals re-enter Action Center as nurture tasks.
2. **Fix 2** (playbook auto-fire on stage change) — single LeadContext edit. Critical for ongoing operations.
3. **Fix 3** (unified gate guard) — kills the close-won bypass.
4. **Fix 4** (legacy literal cleanup) — fixes deal health + forecast accuracy.
5. **Fix 5** (delete migration UI) — housekeeping.

After this, the pipeline rebuild is genuinely complete and the email connection effort can begin.
