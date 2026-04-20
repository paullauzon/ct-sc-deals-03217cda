

# Sequences — closing the last gaps

The build is 90% complete. Four concrete gaps remain that block the wireframe from working end-to-end. All four are small, surgical fixes.

## Gap 1 — Nurture sends don't stamp `sequence_step` on `lead_emails`

**Symptom:** When Malik approves a Day 30 nurture draft and sends it, the resulting `lead_emails` row has `sequence_step = null`. Result: the existing inline "N30 paused on reply" chip in the Activity tab never fires for nurture emails, and the "auto-task from sequence N30" suffix never appears either. The Activity tab plumbing was built for this — nurture is the only sender that doesn't feed it.

**Fix:** In `send-gmail-email` and `send-outlook-email`, when the request body includes `source_draft_id`, look up the draft's `action_key`. If it matches `^(N0|N30|N90|REFERRAL)$`, write that value to `lead_emails.sequence_step` on insert. One small SELECT + one column on the INSERT, in both edge functions.

## Gap 2 — Pausing a lead makes it vanish from the campaign

**Symptom:** Click Pause on the SequenceCard → status becomes `"archived"`. But `leadEnrolledIn()` only counts `active | completed | re_engaged | exited_referral`. A paused lead silently disappears from the Enrolled tab, the index card counts, and the funnel. There's also no "Paused" chip in the status filter row.

**Fix:**
- Rename the Pause status from `"archived"` to `"paused"` (clearer intent, no confusion with `archived_at`).
- Add `"paused"` to `leadEnrolledIn()`'s allowed set.
- Add a "Paused" filter chip to the Enrolled tab and the Overview summary stats grid (becomes 6-up).
- Add a "Paused" status badge to `EnrolledLeadsTable`'s STATUS_LABEL.
- Update `nurture-engine`: skip leads with status `"paused"` (it currently only queries `active`, so this already works, but make it explicit by handling the value if it ever appears in a lookup).
- Update `SequenceCard` to use `"paused"` everywhere it currently says `"archived"`.

## Gap 3 — `nurture-engine` has never run + no manual trigger

**Symptom:** `cron_run_log` is empty for `nurture-engine`. The cron is scheduled (daily 13:00 UTC, verified) but the new code hasn't fired yet, so 283 active leads are sitting with no Day 0 drafts generated. Also there's no UI button to trigger it on demand for testing.

**Fix:**
- Add a small "Run engine now" button on the Sequences index (admin-only via existing `useUserRole` pattern, top-right of header). Invokes `nurture-engine` directly and toasts the summary `{ processed, drafts, tasks, completed, reEngaged, exited }`.
- After Gap 1 and 2 are merged, click the button once. This also surfaces any latent runtime errors in the engine before the next cron tick.

## Gap 4 — `logCronRun` may not write (schema mismatch)

**Symptom:** `cron_run_log` has columns `ran_at` etc., but I didn't audit the `_shared/cron-log.ts` helper to confirm column names match. If they don't, the engine runs successfully but logs nothing, breaking the Automation Health panel for this job.

**Fix:** Open `supabase/functions/_shared/cron-log.ts`, confirm INSERT column names match `cron_run_log` schema, and adjust if needed. Five-minute check.

## Out of scope (intentionally deferred)

- A/B testing on AI copy
- Editing AI prompts from the UI
- Building S5 sample-stall, S3 post-discovery cold, S10 Closed Won onboarding (the framework supports them — adding each is a separate request)
- Backfilling Day 0 drafts for the 283 leads enrolled before AI personalization shipped (next cron tick + manual button covers it)

## Files touched

- `supabase/functions/send-gmail-email/index.ts` — sequence_step stamp
- `supabase/functions/send-outlook-email/index.ts` — sequence_step stamp
- `supabase/functions/_shared/cron-log.ts` — schema audit, fix if needed
- `src/components/sequences/sequenceConfig.tsx` — add `paused` to `leadEnrolledIn`
- `src/components/sequences/SequencesIndex.tsx` — add admin "Run engine now" button
- `src/components/sequences/CampaignDetail.tsx` — add Paused stat + filter chip
- `src/components/sequences/EnrolledLeadsTable.tsx` — add Paused label
- `src/components/lead-panel/cards/SequenceCard.tsx` — `archived` → `paused`

After this build the Sequences feature is complete end-to-end against the original wireframe.

