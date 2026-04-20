

# What remains from the pipeline v2 rebuild — final verification

## Ground truth (verified live just now)

Everything from the original 6-step migration plan in your screenshots is **already shipped and working**. Here's the complete state:

| Your original plan step | Status |
|---|---|
| 1. Bulk rename stages (New Lead→Unassigned, Meeting Set→Discovery Scheduled, etc.) | ✅ **Done** — 0 legacy stages in DB (only 3 archived test rows) |
| 2. Kill Contract Sent, Qualified, Contacted, Went Dark | ✅ **Done** — all merged into v2 equivalents |
| 3. Add Sample Sent stage between Discovery Completed and Proposal Sent | ✅ **Done** — stage exists, gate enforces 8 required fields |
| 4. Triage Revisit/Reconnect (264 deals) | ✅ **Done** — 283 now in Closed Lost, all 283 enrolled in active 90-day nurture |
| 5. Work the 44 Discovery Completed deals | ✅ **Tooling shipped** — Discovery Triage tab surfaces all 44 with Promote→Sample Sent, Close Lost, Snooze buttons; 44 triage tasks already created |
| 6. 90-day nurture for new Closed Lost | ✅ **Done** — `nurture-engine` cron running daily; 337 drafts queued, 40 manual call tasks active |

**Auto AI features tied to stage moves:** All wired:
- Stage gates (`stageGates.ts`) block advancement without required fields
- Auto-playbook tasks fire on every stage change (`playbooks.ts`, 9 playbooks)
- SLA cron (`enforce-stage-slas`, every 15 min) — 196 pending SLA tasks currently active across 8 rules
- Closed Lost → auto-enroll in nurture + 90-day sequence
- Closed Won → auto-create Client Success account (`handle_closed_won` trigger)
- DB trigger `enforce_stage_v2_gates` soft-warns via activity log on gate gaps
- Pipeline Health v2 widget on Dashboard shows drop-off, SLA-stuck, nurture buckets

## What's actually left — four small polish items

### 1. Dashboard loss-reason analytics on `lost_reason_v2`

The DB has the locked `lost_reason_v2` column and the gate writes to it, but `DashboardLossIntelligence.tsx` still reads the old `lostReason` free-text field. With 283 Closed Lost deals now carrying structured reasons, a proper breakdown chart ("Went Dark: 40%, Budget: 15%, Lost to competitor: 8%…") would finally be meaningful. Swap the source field and add a bar chart.

### 2. Sample Outcome column on the Pipeline card

Cards in the Sample Sent column should show the `sampleOutcome` badge (Approved / Lukewarm / Needs revision / No response / Rejected) so Malik can scan the column at a glance. Currently the field exists and the gate enforces it going to Proposal Sent, but it's invisible on the card.

### 3. "Stall reason" prompt on Proposal Sent > 14 days

The SLA function creates an internal task at day 14, but there's no inline UI on the lead panel asking "Why has this proposal stalled?" with the locked dropdown. A small banner at the top of the Deal Room when `daysInStage > 14 && stage === 'Proposal Sent' && !stallReason` with a dropdown + save would close that loop.

### 4. Kill legacy stage values from the TypeScript union

`src/types/lead.ts` still lists 10 legacy stages (`"New Lead"`, `"Meeting Set"`, etc.) in the `LeadStage` union for compile safety. Per the memory file they're kept "indefinitely" until phase 5. Since the DB now has 0 legacy values in active leads, we can actually drop them. But this risks breaking compile in ~667 references — skip unless you want a full sweep.

## Recommendation

**Do #1, #2, #3 — skip #4.** They're all under ~100 lines of code total and directly improve daily usage. #4 is a cleanup with no user-facing benefit and real risk.

## Files to touch

| File | Change |
|---|---|
| `src/components/DashboardLossIntelligence.tsx` | Read `lostReasonV2` instead of `lostReason`; add grouped bar chart |
| `src/components/Pipeline.tsx` | Add `SampleOutcomeBadge` to cards when `stage === 'Sample Sent'` |
| `src/components/lead-panel/LeadPanelHeader.tsx` (or a new `StallReasonBanner.tsx`) | Inline banner with locked dropdown + save to `stall_reason` |

## End state

The 9-stage pipeline, all auto-AI features, stage gates, SLA enforcement, playbooks, 90-day nurture, Discovery Triage inbox, Pipeline Health v2 dashboard, and actor-tracked activity log are **all live and draining backlog automatically**. After this polish pass, Malik sees sample outcomes at a glance, proposal stalls force documentation, and the Lost breakdown becomes a real analytic instead of a word cloud. Everything else from your original prompt is shipped.

