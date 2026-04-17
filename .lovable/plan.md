

## Audit — 150 active leads (CT 76 + SC 74), excluding Lost/Revisit/Went Dark/Closed Won

### What landed last session vs. what didn't

| Field | CT (76) | SC (74) | vs. last session | Status |
|---|---|---|---|---|
| **assigned_to** | **76 (100%)** | **74 (100%* see below)** | ↑ from 49 → 150 | **WIN — auto-assign landed** |
| **next_follow_up** | **68 (89%)** | **70 (95%)** | ↑ from ~52 → 138 | **WIN — auto-schedule landed** |
| deal_intelligence | 29 (38%) | 17 (23%) | unchanged | Capped by transcripts |
| deal_narrative | 29 (38%) | 17 (23%) | unchanged | Backfill held |
| **service_interest ≠ TBD** | **7 (9%)** | **8 (11%)** | unchanged | **Synthesizer never re-ran** |
| **firm_aum / deal_type / txn_type** | **0 / 0 / 0** | **0 / 0 / 0** | **UNCHANGED** | **AI-tier never run (7th session)** |
| forecast fields (4) | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | unchanged | New ForecastCard live, awaiting rep entry |

*\*11 leads still show `assigned_to = ''` — all created `2026-03-03` (legacy seed rows that pre-date the auto-assign backfill). Need a one-shot update.*

### Five findings (ranked by addressable lift)

**Finding 1 — 11 legacy unassigned leads in active stages.** All Meeting Held / Proposal Sent leads created `2026-03-03`, mostly SourceCo + a few Captarget. They were missed by the New-Lead-only backfill. Trivial SQL fix: assign to `Malik`. Examples: CT-046 Mark Paliotti, SC-I-011 Nicholas Tan, SC-T-019 Maximiliano Lieban, etc.

**Finding 2 — Service Interest still TBD on 28 of 44 Meeting Held leads.** The `synthesize-deal-intelligence` prompt was updated last session to extract `serviceInterest`, but **no lead's `deal_intelligence` JSON has the key yet** because the synthesizer was never re-invoked for the existing 46 intel-bearing leads. Verified: `deal_intelligence ? 'serviceInterest'` = false for all 28. **Fix:** run a one-shot batched re-synthesis on those 28 leads (~$0.50, ~3 min wall clock with backoff).

**Finding 3 — AI-tier STILL 0% (7th session).** 150 × 3 = **450 empty cells**. The persistent banner shipped last session — verified live in Pipeline.tsx — but user hasn't clicked "Run now" yet. Same blocker. **No code change needed.**

**Finding 4 — Late-stage stakeholder coverage = 0%.** 49 leads in Meeting Held / Proposal Sent / Qualified, **zero have any `lead_stakeholders` row**. The StakeholderCard exists but nothing populates it. Most discovery transcripts mention a buying committee — `synthesize-deal-intelligence` already extracts a `buyingCommittee` array into `deal_intelligence` JSON. **Fix:** add a one-shot promotion step in `bulk-process-stale-meetings` that writes `deal_intelligence.buyingCommittee[]` into `lead_stakeholders` rows when none exist for that lead. Free, ~46 leads gain real stakeholders.

**Finding 5 — 90 New Leads with zero pending tasks.** Auto-schedule sets `next_follow_up` (a date string), but no actual `lead_tasks` row was created — so they don't appear in the Action Queue or Follow-Ups tab, only in date-filtered views. The "Follow-Ups" tab is the rep's daily driver, so these 90 leads are invisible in it. **Fix:** also insert a `lead_tasks` row (`task_type='follow_up'`, `playbook='new_lead_initial_outreach'`) when New Leads are auto-scheduled, so they appear in the operational queue.

### Confirmed structural / out-of-scope (no action)

- 8 stale-transcript leads (`transcript_len = 0`) — needs separate Fireflies re-fetch path
- `budget_confirmed` / `stall_reason` low coverage — real signal limit
- `email_state`: no inbound emails tracked yet (Outlook deep sync paused, per memory)
- CT acq_timeline = 0 — form lacks field

### Plan

**Step 1 — Backfill 11 legacy unassigned leads.** One SQL update: `UPDATE leads SET assigned_to = 'Malik' WHERE archived_at IS NULL AND assigned_to = '' AND stage NOT IN (terminal stages)`. Verifies → 0 unassigned.

**Step 2 — Re-synthesize the 46 leads with intel but no `serviceInterest` key.** Add a tiny edge function `bulk-resynthesize-service-interest` (or extend `bulk-process-stale-meetings` with a `?mode=service_interest` flag) that loops the 46 leads, calls `synthesize-deal-intelligence`, and promotes the new `serviceInterest` to the column. Trigger via existing Pipeline dropdown.

**Step 3 — Promote `buyingCommittee` → `lead_stakeholders`.** Extend `bulk-process-stale-meetings` to insert one stakeholder row per buyingCommittee entry when the lead has zero stakeholder rows. Idempotent (only fires when `lead_stakeholders` empty). Expected ~46 leads × 1–3 stakeholders = ~80 new stakeholder rows surfaced in the Stakeholder Card.

**Step 4 — Auto-create `lead_tasks` row alongside auto-schedule.** Update `ingest-lead` to also INSERT a `lead_tasks` row on New Lead creation. One-shot SQL backfill: insert one task per of the 90 task-less New Leads.

**Step 5 — Update audit baseline** at `.lovable/audit/coverage-2026-04-17.md`.

### Files touched
- `supabase/functions/bulk-process-stale-meetings/index.ts` — add `mode=service_interest` re-synth path + `buyingCommittee → lead_stakeholders` promotion
- `supabase/functions/ingest-lead/index.ts` — also insert `lead_tasks` row on New Lead
- `src/components/Pipeline.tsx` — add "Re-extract service interest" dropdown item
- One-off SQL: assign 11 legacy leads + insert 90 backfill tasks
- `.lovable/audit/coverage-2026-04-17.md` — append

### Trade-offs
- **Win:** 100% assignment coverage (was 92.7%), 28 leads gain `service_interest`, ~46 leads gain stakeholder rows visible in StakeholderCard, 90 New Leads enter the Follow-Ups operational queue.
- **Cost:** ~$0.50 OpenAI for 46-lead re-synth (incremental tokens only). ~$3 still pending for AI-tier batch when user clicks. Code: 2 function edits, 1 dropdown item, 2 SQL one-shots.
- **Risk:** Stakeholder promotion is additive and idempotent (only fires when empty). `buyingCommittee` data quality varies — will only insert rows where `name` is non-empty.
- **Loss:** None — all additive.

### Verification
1. SQL: `assigned_to = '' AND archived_at IS NULL AND stage NOT IN (...)` → **0** (was 11)
2. SQL: `service_interest <> '' AND service_interest <> 'TBD' AND stage = 'Meeting Held'` → **≥35** (was 15)
3. SQL: `SELECT COUNT(DISTINCT lead_id) FROM lead_stakeholders WHERE lead_id IN (active intel-bearing)` → **≥30** (was 0)
4. SQL: `lead_tasks` rows for active New Leads → **≥90** (was ~0)
5. Open SC-T-064 (Odanette Isaac, Meeting Held) → assigned_to = Malik, StakeholderCard shows real names, service_interest set
6. AI-tier still 0% until user clicks the Pipeline banner — separate user action

