

# End-to-end audit — what's actually working vs. still broken

I checked the DB, edge functions, cron schedules, and all UI wiring. Here's the honest state.

## ✅ What works (verified)

| Area | Evidence |
|---|---|
| **Zero legacy stages in DB** | `legacy_in_db = 0` — all 437 active leads on v2 stages |
| **All 3 cron jobs active** | enforce-stage-slas (15min), nurture-engine (daily 13:00 UTC), sync-fireflies (15min) |
| **SLA tasks firing** | 14 live: 7 discovery-no-fireflies, 4 proposal-3day, 3 proposal-stall |
| **Playbook auto-fire wired** | `LeadContext.tsx:338` calls `getPlaybookForStage()` + `generateTasksFromPlaybook()` on stage change |
| **StageGateGuard wired into Pipeline drag-drop** | `Pipeline.tsx:1122` |
| **Nurture day-0 fired** | 283 `nurture-d0` drafts created |
| **Nurture day-30 fired** | 54 `nurture-d30` drafts created |
| **Nurture day-45 tasks** | 40 created |

## ❌ What's still broken or unfinished

### 1. **243 of 283 active nurture leads have ZERO nurture tasks** (CRITICAL)
Only 40 of 283 enrolled leads have a nurture task. The drafts went into `lead_drafts` (337 total) but the d45/d90 task generation is incomplete — likely the loop only inserted the `>=45` bucket and skipped `>=90` for the 200+ deals already past 90 days. **Means the Action Center is missing ~240 nurture follow-ups.**

### 2. **44 Discovery Completed deals never triaged into Sample Sent** (the original 91% leak)
The whole point of the rebuild — and it's untouched. `discovery_needs_triage = 44` deals have empty `sample_sent_date` AND empty `sample_outcome`. The DiscoveryWorklistTab UI was deleted as part of "cleanup" before this got resolved. **Need a one-shot SQL or replacement triage UI.**

### 3. **Hardcoded legacy stages still in 18 files** (analytics drift)
- `src/components/lead-panel/LeadPanelLeftRail.tsx:26` — stage dropdown lists 12 legacy stages, missing Sample Sent, In Contact, Discovery Scheduled/Completed, Negotiating, Closed Lost. **Users can pick "Meeting Held" from the dropdown right now.**
- `src/components/DashboardBusiness.tsx:14` — `ACTIVE_STAGES` is the old 8-stage list, ignores Sample Sent
- `src/contexts/LeadContext.tsx:452`, `src/components/Dashboard.tsx` (4 places), `LeadDetailPanel.tsx:241`, `DashboardEconomics.tsx` (3 places), `DashboardBusiness.tsx` (8 places) — all use `["Closed Won", "Lost", "Went Dark"]` literals instead of `TERMINAL_STAGES` / `isClosedStage()`. Since DB only has "Closed Lost" now, these checks **silently skip the 283 closed-lost deals** in pipeline-value, conversion-rate, and stale-lead calcs.
- `src/data/sourceCoLeads.ts:53` — sets `stage: "New Lead"` for fresh seeds

### 4. **85 Unassigned leads stuck >5 days have no SLA rule**
Cron handles Discovery/Sample/Proposal/Negotiating but not Unassigned. 85 inbound leads with no playbook task wake-up. Add `sla-unassigned-stale` rule (>3d unanswered → "Send first touch").

### 5. **Closed Won handler triggers off old `Closed Won` only — fine, but no v2 gate enforcement on it**
`handle_closed_won()` DB trigger creates the Valeria account on stage change, BUT the `enforce_stage_v2_gates()` trigger is a **soft warn only** (writes to activity log). Hard enforcement only happens in the React `StageGateGuard`. If anyone moves a deal via SQL or a future API, gates are bypassed.

---

## Plan: 4 fixes to truly close out the rebuild

### Fix A — Backfill missing nurture tasks (1 min)
Re-invoke `nurture-engine` with a flag to upsert all milestones for active leads, idempotently. Or one SQL: insert d45 + d90 tasks for the 243 missing leads based on `nurture_started_at + interval`. Verify all 283 active nurture leads have at least one pending task.

### Fix B — Triage the 44 Discovery Completed graveyard (5 min)
Single SQL migration:
- For each: if `meeting_date` is within 14 days AND has fireflies transcript → move to `Sample Sent`, set `sample_sent_date = today`, queue sample-sent playbook
- Otherwise → keep in Discovery Completed but auto-create one task: "Decide: send sample or close-lost"

### Fix C — Kill all legacy stage literals (the real cleanup) (~15 file edits)
Mechanical sweep:
1. `LeadPanelLeftRail.tsx:26` — replace STAGES with `ALL_STAGES` from leadUtils
2. Replace every `["Closed Won", "Lost", "Went Dark"]` and `["Lost", "Went Dark"]` with `isClosedStage(stage)` / `TERMINAL_STAGES.includes(...)` in 18 files
3. `DashboardBusiness.tsx:14` — use `ACTIVE_STAGES` from leadUtils
4. `sourceCoLeads.ts:53` — `"New Lead"` → `"Unassigned"`
5. Wrap any remaining `lead.stage === "Lost"` with `normalizeStage(lead.stage) === "Closed Lost"` (or just delete — DB has no Lost rows)

### Fix D — Add SLA rule for stuck Unassigned leads (1 file)
Add rule to `enforce-stage-slas/index.ts`: `Unassigned > 3d` → "Send first outreach". Then invoke once to seed against the 85 stuck leads.

---

## What's NOT broken (intentionally left)

- `LEGACY_STAGES` array in `leadUtils.ts` — kept as a reference list for `STAGE_LABEL_MAP`. Safe to keep.
- The `enforce_stage_v2_gates` DB trigger soft-warning behavior — by design (UI does hard enforcement, DB just audits).
- `LEAD_STATUSES`, owner colors, etc. — unrelated to v2.

**Order to ship: A → B → D → C** (A unblocks the Action Center immediately; B fixes the original drop-off problem; D plugs the inbound leak; C is mechanical cleanup last so we can verify nothing regresses).

After this batch, the pipeline rebuild is genuinely 100% done and email-sync work can begin.

