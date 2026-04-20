---
name: Pipeline Workflow v2
description: 9 Pipeline v2 stages + gate definitions, SLA auto-tasks, and 90-day nurture replacement for R/R
type: feature
---

# Pipeline v2 (replaces 11-stage v1)

## The 9 stages
1. **Unassigned** (was "New Lead") — fresh inbound, no owner action yet
2. **In Contact** (merged "Qualified" + "Contacted") — first outreach made
3. **Discovery Scheduled** (was "Meeting Set")
4. **Discovery Completed** (was "Meeting Held")
5. **Sample Sent** (NEW) — fixes the 91% Discovery → Proposal leak
6. **Proposal Sent**
7. **Negotiating** (merged "Negotiation" + "Contract Sent")
8. **Closed Won**
9. **Closed Lost** (merged "Lost" + "Went Dark"; "Went Dark" is a lost reason)

## Killed
- **Revisit/Reconnect** — replaced by 90-day nurture sequence on Closed Lost.

## Stage gates (`src/lib/stageGates.ts`)
- **→ Discovery Completed**: `firefliesUrl` required (or attached meeting with Fireflies)
- **→ Sample Sent**: 8 fields — serviceInterest, geography, ebitdaMin/Max, dealType, competingAgainst, budgetConfirmed, authorityConfirmed
- **→ Proposal Sent**: `sampleOutcome` set
- **→ Negotiating**: `dealValue` > $100
- **→ Closed Won**: `subscriptionValue`, `contractEnd`, `tier`
- **→ Closed Lost**: `lostReasonV2` (locked dropdown)
- Override available — logged to `stage_gate_overrides` JSONB audit array.

## SLA auto-tasks (`enforce-stage-slas` edge function, 15-min cron)
- Discovery Scheduled + meeting > 24h + no Fireflies → "Reconcile meeting"
- Sample Sent > 5d no sampleOutcome → "Log sample outcome"
- Proposal Sent > 3d → "Follow up on proposal"
- Proposal Sent > 14d no stallReason → "Document stall reason"
- Negotiating > 7d → "Push the close — direct call"
Each rule is idempotent (won't re-fire within 7 days for same lead).

## v2 Playbooks (`src/lib/playbooks.ts`)
Keyed by v2 stage names; `getPlaybookForStage()` normalizes legacy stage values.
- `unassigned`, `in-contact`, `discovery-scheduled`, `discovery-completed`
- `sample-sent` (d+2 / d+5 / d+10 / d+14)
- `proposal-sent`, `negotiating`
- `nurture-90day` (d0 insight / d30 update / d45 call / d90 re-open ask) — fires on Closed Lost

## Legacy compatibility
- `STAGE_LABEL_MAP` translates legacy DB stage values → v2 display labels at read time.
- `normalizeStage()` is the canonical translation function — used everywhere reads happen.
- `Pipeline.tsx` columns aggregate by normalized stage so legacy "Meeting Held" deals appear under "Discovery Completed" without touching the DB.
- Legacy stage names stay in the `LeadStage` type union until phase 5 cleanup.

## Auto-enrollment
- Moving a deal to Closed Lost auto-sets `nurtureSequenceStatus = "active"`, `nurtureStartedAt`, and `nurtureReEngageDate` (today + 90 days).
- Triggers `nurture-90day` playbook.

## Data fields added (migration `add_pipeline_v2_fields`)
- `nurture_sequence_status`, `nurture_started_at`, `nurture_re_engage_date`
- `lost_reason_v2` (locked dropdown)
- `stage_gate_overrides` jsonb audit log
- `discovery_call_completed_at`
- DB trigger `enforce_stage_v2_gates()` — soft-warns via `lead_activity_log`
