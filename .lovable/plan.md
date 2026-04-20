

# Pipeline rebuild — comprehensive multi-phase plan

The screenshots specify a complete pipeline restructure with stage renames, merges, deletions, one critical new stage (Sample Sent), gate-to-advance enforcement, SLA-driven auto-tasks, and a 90-day nurture sequence replacing the 264-deal Revisit/Reconnect graveyard.

This is large enough to ship in **5 phases across multiple sessions**. Each phase is independently shippable and reversible.

## The target structure (from screenshots)

| # | New stage | Old stage | Action |
|---|-----------|-----------|--------|
| 1 | Unassigned | New Lead | Rename |
| 2 | In Contact | Qualified + Contacted | Merge two into one |
| 3 | Discovery Scheduled | Meeting Set | Rename |
| 4 | Discovery Completed | Meeting Held | Rename |
| 5 | **Sample Sent** | — | **NEW** (between Discovery Completed and Proposal Sent) |
| 6 | Proposal Sent | Proposal Sent | Keep |
| 7 | Negotiating | Negotiation + Contract Sent | Merge (Contract Sent killed — it's an activity, not a stage) |
| 8 | Closed Won | Closed Won | Keep |
| 9 | Closed Lost | Lost + Went Dark | Merge (Went Dark becomes a Lost Reason) |
| — | Revisit/Reconnect | Revisit/Reconnect | **Killed** — replaced by 90-day nurture sequence on Closed Lost |

Current DB state (verified live): R/R holds 264 deals = $380K MRR. Discovery Completed has 44 deals = $217.8K (the richest stage). 91% drop-off Discovery Completed → Proposal Sent is the core leak Sample Sent fixes.

---

## Phase 1 — Type system + DB schema migration (foundation)

The new stages must exist in code before any UI can use them. Old stages stay in the type union temporarily so existing data renders.

**1.1 — Update `LeadStage` union in `src/types/lead.ts`**
Add the 9 new names. Keep old names as deprecated aliases until phase 5.
```
"Unassigned" | "In Contact" | "Discovery Scheduled" | "Discovery Completed" |
"Sample Sent" | "Proposal Sent" | "Negotiating" | "Closed Won" | "Closed Lost"
// + legacy: "New Lead" | "Qualified" | "Contacted" | "Meeting Set" |
//   "Meeting Held" | "Negotiation" | "Contract Sent" | "Revisit/Reconnect" |
//   "Lost" | "Went Dark"
```

**1.2 — Rebuild `src/lib/leadUtils.ts`** as the single source of truth:
- `ACTIVE_STAGES` = the 7 working stages (Unassigned → Negotiating)
- `TERMINAL_STAGES` = `["Closed Won", "Closed Lost"]`
- `LEGACY_STAGES` = old names still in DB
- `STAGE_LABEL_MAP` for old→new display rename without DB migration
- `normalizeStage(stage)` helper — translates legacy → new at read time
- `CLOSED_STAGES`, `LATE_STAGES` updated everywhere (single import — kills the 17+ duplicated literal arrays found across the codebase)

**1.3 — DB migration `add_pipeline_v2_fields`** — adds new columns and lost-reason enum:
- `nurture_sequence_status` (text: `null | "active" | "re_engaged" | "completed" | "archived"`)
- `nurture_started_at` (timestamptz)
- `nurture_re_engage_date` (date) — when day-0 nurture email goes out
- `lost_reason_v2` (text) — locked dropdown of 9 values incl. "Went Dark / No response", "Budget", "Timing", "Lost to competitor", etc.
- `stage_gate_overrides` (jsonb) — audit log of when a rep bypasses a gate
- `discovery_call_completed_at` (timestamptz)
- `sample_sent_outcome` (text — already exists as `sample_outcome`, will reuse)
- Trigger `enforce_stage_v2_gates()` — soft-warns on missing gate fields via `lead_activity_log` (not blocking — UI handles hard gating)

**1.4 — Migration data backfill** — does NOT auto-move deals. Just normalizes display:
- All 90 New Lead deals → still stored as "New Lead", displayed as "Unassigned"
- All 264 R/R deals → flagged `nurture_sequence_status = "needs_triage"` (the bulk renaming UI in phase 4 walks through these)
- Lost (18) + Went Dark (1) → stored as "Lost"/"Went Dark", displayed as "Closed Lost"
- No deal is moved between stages without rep confirmation

---

## Phase 2 — Gates + SLA engine (the differentiator)

This is what makes the new pipeline actually enforce sales discipline.

**2.1 — `src/lib/stageGates.ts` (new)** — pure data definitions:
```ts
STAGE_GATES: Record<NewStage, { requiredFields: (keyof Lead)[]; description: string }>
```
- **Discovery Scheduled → Discovery Completed**: Fireflies URL required
- **Discovery Completed → Sample Sent**: 8 fields required (Fireflies URL, firmType, serviceInterest, target sectors, geography, ebitdaMin/Max, dealType, competingAgainst, budgetConfirmed, authorityConfirmed)
- **Sample Sent → Proposal Sent**: `sampleOutcome` filled (Approved/Lukewarm/Needs revision/No response/Rejected)
- **Proposal Sent → Negotiating**: `dealValue` is a real number > $100
- **Negotiating → Closed Won**: `subscriptionValue`, `contractEnd`, `tier` (CT) OR `successFeePct`, `engagementStartDate` (SC)
- **Closed Lost (any → )**: `lostReasonV2` required from locked dropdown

**2.2 — Gate enforcement in `LeadPanelHeader.handleStageClick()`**
Generalize the existing `closeWonGuard` modal into a `StageGateGuard` modal that:
- Shows missing fields as a checklist
- Inline-edits each missing field directly in the modal (no second navigation)
- "Override gate" button (logged to `stage_gate_overrides`) — for legit edge cases
- Routes through the existing `request-stage-change` event so right-rail PipelineStagesCard reuses it

**2.3 — SLA auto-tasks via cron** — new edge function `enforce-stage-slas` (15-min cron):
- Proposal Sent in stage > 3 days with no movement → auto-task "Follow up on proposal"
- Proposal Sent in stage > 14 days → require `stallReason` to keep deal in stage (warning chip on card)
- Sample Sent > 5 days no `sampleOutcome` → auto-task "Log sample outcome"
- Discovery Scheduled with meeting > 24h ago and no Fireflies URL → auto-task "Reconcile meeting"

**2.4 — Replace `src/lib/playbooks.ts`** with v2 keyed to new stage names:
- `unassigned` (replaces new-lead-no-response)
- `discovery-scheduled` (replaces meeting-set)
- `discovery-completed` (replaces meeting-held)
- `sample-sent` (NEW — d+2 check-in, d+5 outcome reminder, d+10 nudge if no response)
- `proposal-sent` (kept, retuned)
- `negotiating` (replaces both negotiation and contract-sent)
- `nurture-90day` (NEW — d0 insight email, d30 market update, d45 manual call task, d90 explicit re-open ask)

Mapping uses normalized stage names so legacy "Meeting Set" still triggers the playbook via `STAGE_LABEL_MAP`.

---

## Phase 3 — UI rename + new Sample Sent stage everywhere

Everything that hardcodes stage names must read from `leadUtils`.

**3.1 — Single-source-of-truth refactor** — kill these duplicate arrays in 17 files:
- `src/contexts/LeadContext.tsx` (line 43)
- `src/components/Pipeline.tsx` (line 35)
- `src/components/Dashboard.tsx` (line 34)
- `src/components/DashboardForecast.tsx`, `DashboardOperations.tsx`, `DashboardPersonaMetrics.tsx`, `DashboardCompetitiveRadar.tsx`, `DashboardSignalIntelligence.tsx`
- `src/components/IntelligenceCenter.tsx`, `LeadsTable.tsx`, `PipelineFilters.tsx`, `PipelineSnapshots.tsx`, `ActionQueue.tsx`
- `src/components/command-center/{DealPulseTab,FollowUpsTab,ScheduleTab,PrepIntelTab}.tsx`
- `src/components/lead-panel/{LeadPanelLeftRail,LeadPanelHeader}.tsx` + `cards/ForecastCard.tsx` + `shared.tsx`
- `src/lib/{dealHealthUtils,dealPredictions,meetingCoach}.ts`
- `supabase/functions/{daily-standup,bulk-process-stale-meetings,bulk-enrich-sourceco,process-meeting,enrich-lead}/index.ts`

All read from `ACTIVE_STAGES`/`TERMINAL_STAGES` exports. Probability/cycle-day weight maps update to include `"Sample Sent": 0.50` (between Discovery 0.40 and Proposal 0.55).

**3.2 — Update `dealPredictions.ts` weights** for the new 9-stage funnel:
```
Unassigned 5 · In Contact 12 · Discovery Scheduled 22 · Discovery Completed 35 ·
Sample Sent 50 · Proposal Sent 62 · Negotiating 78 · Closed Won 100 · Closed Lost 0
```

**3.3 — `meetingCoach.ts` rename keys** so "Discovery Scheduled" + "Discovery Completed" use the existing checklists previously keyed to "Meeting Set" + "Meeting Held".

---

## Phase 4 — Migration UI (the 264-deal triage tool)

**4.1 — New page `src/components/PipelineMigration.tsx`** — accessed from System Switcher → Settings (one-time tool, hidden after R/R count = 0):
- **Tab 1 — Bulk renames** (10 min): one-click button per rename pair (auto-runs `UPDATE leads SET stage='Unassigned' WHERE stage='New Lead'` etc.). Migration runs as a single transaction with rollback on error.
- **Tab 2 — Dead stage cleanup** (5 min): the 1 Qualified deal moves to In Contact, the 1 Went Dark moves to Closed Lost with lost_reason="Went Dark / No response". Contracted Sent (0) and Contacted (0) just disappear.
- **Tab 3 — Discovery Completed worklist** (44 deals): triage table sorted by deal value. For each: "Sample sent already?" YES → moves to Sample Sent + opens Sample Outcome inline. NO → keeps in Discovery Completed + auto-creates "Send sample" task. COLD → fills `stallReason` then routes to Closed Lost.
- **Tab 4 — R/R triage** (264 deals, 2-3 hours, sorted by Last Engaged): batch picker with three buckets per the screenshot logic:
  - (A) Last contact <12mo + value >$1.5K → Move to In Contact + create "Re-engage" task
  - (B) Has Fireflies + any engagement → Closed Lost with re_engage_date 90d out, enroll in nurture
  - (C) >2yo, no Fireflies → bulk Closed Lost, no re-engage, archive
- **Progress tracker**: shows R/R count dropping live as triage runs (264 → 0 target).

**4.2 — `nurture-engine` edge function (cron daily)** — drives the 90-day sequence:
- Day 0: send insight email (queued via lead_drafts, manual approve)
- Day 30: send market update template
- Day 45: create call task for Malik
- Day 90: create "Re-open ask" task. If response → flip `nurture_sequence_status = "re_engaged"` + move back to In Contact. If no response → `nurture_sequence_status = "completed"` and archive.

---

## Phase 5 — Cleanup + telemetry

**5.1 — Delete legacy stage names from `LeadStage` union.** Any deal still on legacy stage at this point fails type check — forces final cleanup.

**5.2 — Update memory file** `mem://features/pipeline-workflow.md` — replace 11-stage spec with 9-stage spec + gate definitions.

**5.3 — New dashboard widget** "Pipeline health v2" showing:
- Stage drop-off % between each stage (the 91% leak should drop)
- # deals stuck past SLA per stage
- Nurture sequence performance (% re-engaged / completed / archived)

**5.4 — Backfill all auto-tasks** for deals currently in stages without their v2 playbook tasks (one-time edge function `backfill-stage-v2-tasks`).

---

## What ships per session (recommended)

| Session | Phases | Outcome |
|---|---|---|
| 1 (next) | Phase 1 + Phase 2.1 + 2.2 | Types, DB schema, gate definitions, gate-guard modal — invisible UI change but enforcement live |
| 2 | Phase 2.3 + 2.4 + Phase 3 | All UI shows new stage names, Sample Sent stage visible, SLA cron + new playbooks live |
| 3 | Phase 4 (migration UI) | The 264-deal R/R triage tool — Malik + you do the 2-3 hour session against it |
| 4 | Phase 5 | Cleanup, delete legacy types, dashboard, memory updates |

## Risks + mitigations

- **Risk**: Stage rename breaks existing automation that hardcodes "Meeting Held" → mitigated by `STAGE_LABEL_MAP` + `normalizeStage()` so legacy code keeps working until phase 5.
- **Risk**: Gate enforcement frustrates Malik mid-deal → mitigated by "Override gate" button (logged for review).
- **Risk**: Nurture sequence sends bad emails → mitigated by `lead_drafts` queue (manual approve, not auto-send).
- **Risk**: Migration UI moves wrong deals → all moves logged to `lead_activity_log` with old/new value, full undo available.

## What's NOT in scope here (to keep this manageable)

- Email connection deep work (you mentioned that's the next effort after this).
- Renewal Due / Paused stages on Valeria's CS pipeline (already exists).
- Renaming UI strings inside reports that say "Meeting Held" historically — those are factual references and stay.

