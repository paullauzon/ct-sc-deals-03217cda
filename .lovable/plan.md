

# Finish what we started — 4 loose ends from the email-attribution plan

I audited what shipped vs. what's still pending. Three real issues remain, plus one I missed entirely the first time around.

## What's done
- Eagle Partners secondary contacts on CT-283 — applied
- 14 emails moved off duplicate leads to canonicals — applied
- Trigger function for claim/delete — written and migrated
- `claim-email.ts` shared helper — created
- Company Inbox UI tab in Unmatched Inbox — created
- Mailboxes "Email matching" strip with Re-run / Cleanup buttons — shipped

## What I found still broken (re-audit just now)

### 1. Duplicate triggers on `lead_emails` — root cause of recurring drift
`pg_trigger` shows **four triggers where there should be two**:
- `trg_update_lead_email_metrics` (legacy) AND `trg_lead_emails_metrics_insert` — both fire `update_lead_email_metrics()` on every INSERT
- `trg_update_lead_email_metrics_on_claim` AND `trg_lead_emails_metrics_claim` — both fire `update_lead_email_metrics_on_claim()` on every UPDATE of `lead_id`

Every email Outlook syncs in is being counted **twice**. Every reassignment is being decremented from old / incremented to new **twice**. That's why we cleaned up 25 leads yesterday and already see new drift on CT-013 (`metric_sent=16` vs `actual=15`) and CT-436 (`metric_sent=4` vs `actual=3`).

**Fix:** Migration that drops the legacy duplicates `trg_update_lead_email_metrics` and `trg_update_lead_email_metrics_on_claim`. Keep the newer `trg_lead_emails_metrics_*` set. One-line migration.

### 2. Nine orphan metric rows whose emails no longer exist on the lead
`lead_email_metrics` has rows for SC-I-004, SC-I-013, SC-I-016 (the duplicates whose emails were correctly moved to CT-012/CT-039/CT-055), and CT-228, CT-344, SC-T-034, SC-I-009, CT-070 (leads that have **zero** emails attached but stale counter rows).

Symptom in the UI: deal-room "Last reply: Xd ago" or "3 emails" shown on a lead that genuinely has 0 emails — same false-signal class as the original Benjamin Parrish bug.

**Fix:** SQL data correction — delete the 9 orphan/zero rows, then recompute counters for CT-013 and CT-436 from scratch (they got +1 sent each from the double-trigger between yesterday's cleanup and now).

### 3. The safe rematch sweep (step 6) was never executed
Plan called for one POST to `rematch-unmatched-emails` with `{limit: 5000}`. Was deferred to "click the button when ready" — never clicked. **20,990 emails still in unmatched**, of which a few hundred are likely safely claimable under the strict exact-email rule (especially the new Outlook backfill emails from the past 24h: 13,500 unmatched added since yesterday).

**Fix:** I'll call the edge function directly with `curl_edge_functions` (server-side, no UI button needed) and report `{matched, scanned, remaining}` back. If it claims a lot of legit emails cleanly, great — if it claims very few, that confirms the unmatched bucket is mostly genuine noise (newsletters, billing blasts, conference invites) and the Company Inbox is the right surface for the rest.

### 4. One thing the original plan missed entirely — the legacy `update_lead_email_metrics` function still exists
The function `update_lead_email_metrics()` (the original INSERT-only handler) is still registered. Even after dropping the duplicate trigger, it remains as dead code. Two functions doing nearly-identical work is exactly how the duplicate-trigger problem snuck in.

**Fix:** Drop `update_lead_email_metrics()` after confirming nothing else references it. The `update_lead_email_metrics_on_claim` function already handles the INSERT case correctly (the `lead_changed` flag short-circuits if `OLD` is null, since INSERT has no OLD — wait, it actually doesn't, INSERT path needs its own branch). Cleaner approach: keep `update_lead_email_metrics` for INSERT only, keep `update_lead_email_metrics_on_claim` for UPDATE only, keep `update_lead_email_metrics_on_delete` for DELETE only — three single-purpose functions, three single triggers, zero overlap. That's what step 1 actually delivers once the legacy duplicates are dropped.

## Execution (default mode, in order)

1. **Migration** — drop the two legacy duplicate triggers `trg_update_lead_email_metrics` + `trg_update_lead_email_metrics_on_claim`. Leaves three clean single-purpose triggers.
2. **Data correction** — delete 9 orphan/zero `lead_email_metrics` rows; recompute CT-013 and CT-436 from `lead_emails` aggregate.
3. **Safe sweep** — POST to `rematch-unmatched-emails` `{limit: 5000}` and report numbers.
4. **Verification** — re-run the drift query and confirm 0 leads with mismatched counters; check that the deal-rooms for CT-228 / CT-344 / SC-T-034 (which currently show phantom email counts) now correctly show 0 emails.

No new files. No code changes outside one short migration. No UI changes — the Mailboxes / Company Inbox / Unmatched Inbox surfaces shipped earlier are correct; this round just removes the under-the-hood duplication that's silently re-creating drift.

