

# Sequences — final verification + 4 remaining gaps

I traced every item from the original prompt + both approved plans against the live code AND the live database. The build is structurally complete, but **4 concrete data/behavior gaps remain** before this works end-to-end. Three are data hygiene from the engine never having run, one is a real bug.

## ✅ Shipped and verified correct

| Item | Status |
|---|---|
| Sequences index page (`/#view=sequences`) with stats + Run Engine button | ✅ |
| Campaign Detail (3 tabs: Overview / Enrolled / Activity log) | ✅ |
| 4-step timeline visual matching wireframe verbatim | ✅ |
| 6-up summary stats (Enrolled · Active · Re-engaged · Paused · Completed · Exited) | ✅ |
| Funnel widget (Enrolled → D0 → D30 → D45 → D90 → Re-engaged) | ✅ |
| Enrolled leads sortable table with Pause/Resume/Exit | ✅ |
| Activity log with step filter (N0/N30/N45/N90) | ✅ |
| Per-lead `SequenceCard` in deal panel right rail | ✅ |
| `generate-nurture-email` edge function with 12 lost-reason angles | ✅ |
| Engine Scope Mismatch exit branch + LeadContext guard | ✅ |
| `nurture_step_log` + `nurture_exit_reason` columns | ✅ |
| `paused` status everywhere with `archived` legacy fallback | ✅ |
| Send-gmail / send-outlook lookup `action_key` to stamp `sequence_step` | ✅ (code) |
| `logCronRun` schema audit | ✅ |

## ⚠ Gaps that block the wireframe end-to-end

### Gap A — 283 existing drafts have wrong `action_key` (`nurture-d0` instead of `N0`)

**Evidence:** Database query confirms all 283 existing nurture drafts were written by an older engine version that used `action_key = "nurture-d0"` (the draft_type) instead of the new `N0` short code. The send-gmail / send-outlook regex `^(N0|N30|N45|N90|REFERRAL)$` will fail to match these, so when Malik approves and sends any of the 283 backlog drafts, `lead_emails.sequence_step` will still be `null`. The fix from Plan 2's Gap 1 only works for drafts the new engine produces.

**Fix:** One-line SQL migration to rewrite the 283 stale rows: `UPDATE lead_drafts SET action_key = CASE draft_type WHEN 'nurture-d0' THEN 'N0' WHEN 'nurture-d30' THEN 'N30' WHEN 'nurture-d90' THEN 'N90' WHEN 'nurture-referral' THEN 'REFERRAL' END WHERE draft_type LIKE 'nurture%' AND action_key NOT IN ('N0','N30','N45','N90','REFERRAL');`

### Gap B — `nurture_step_log` is empty for all 283 active leads

**Evidence:** `with_step_log = 0` across all 283 active leads. The Sequences UI funnel reads counts from `nurture_step_log` (CampaignDetail L37-40), so the funnel currently shows D0=0 / D30=0 even though 283 drafts exist. The SequenceCard in the right rail also shows "Last: —" for everyone. Reason: drafts were created before the `appendStepLog` call was added to the engine.

**Fix:** Backfill migration that walks `lead_drafts` for nurture types and synthesizes `nurture_step_log` entries on each lead from the existing draft rows. Simple `UPDATE leads SET nurture_step_log = (SELECT jsonb_agg(...) FROM lead_drafts WHERE lead_id = leads.id AND draft_type LIKE 'nurture%')`. Idempotent.

### Gap C — Activity log will be empty for the 283 backlog drafts

**Evidence:** `lead_activity_log` has 0 nurture event rows. Engine writes `nurture_draft_emitted` only when it generates a fresh draft, so the backlog is invisible in the Activity log tab and in the per-lead Activity timeline.

**Fix:** Same backfill migration as B writes one `nurture_draft_emitted` row per existing nurture draft (with `metadata.step` and `new_value` set so the existing step filter works).

### Gap D — Engine never ran the new code (manual trigger button works, just hasn't been clicked)

**Evidence:** `cron_run_log` for `nurture-engine` has 0 rows. Cron is scheduled daily 13:00 UTC but the new code hasn't fired yet. The "Run engine now" button shipped in the last build, but it hasn't been used. After Gaps A/B/C are fixed, clicking it once will: (1) regenerate any missing AI copy for leads where the previous draft was static-template, (2) confirm cron logging is wired, (3) populate `cron_run_log` so the Automation Health panel shows it.

**Fix:** No code change. Click "Run engine now" once on the Sequences index after the migrations land.

## What I'm NOT touching (intentional, per original out-of-scope list)

- Building S5 / S3 / S10 sequences (framework supports them — separate request)
- A/B testing on AI copy
- Editing AI prompts from the UI
- Per-step rep preview before cron fires (drafts already land in Action Center for review)

## Files touched

- **New migration**: `supabase/migrations/<timestamp>_nurture_backfill.sql` — three idempotent UPDATE statements (rewrite `action_key`, backfill `nurture_step_log`, backfill `lead_activity_log` rows)

That's it. One migration file. After it runs and you click "Run engine now" once, Sequences is complete end-to-end against the original wireframe and prompt.

