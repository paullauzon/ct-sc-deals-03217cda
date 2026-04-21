

# Email backfill — final 3 real issues, after a deep DB trace

I just queried the live database and traced cron execution. The architecture is fully wired and cron is firing reliably. But three concrete defects show up in the actual data right now.

## Issue 1 — Auto-enroll has never fired despite 4+ days of cron runs and an active connection

**Live evidence:**
- `user_email_connections` has 1 active Gmail row (`id@captarget.com`, created 2026-04-20)
- `email_backfill_jobs`: **0 rows ever**
- `email_backfill_queue`: **0 rows**
- `lead_emails`: **0 rows total**
- `email_sync_runs`: 50+ rows, every single one `mode=incremental, fetched=0, inserted=0` going back to last week
- `sync-gmail-emails-10min` cron: firing every 10 min, returns "succeeded"

The connection has `history_id` set, so `sync-gmail-emails` runs the incremental path on every cron tick — and finds zero new messages because Malik hasn't sent/received anything via this Gmail account yet (or the incremental cursor is past everything). Meanwhile auto-enroll **only fires when someone opens the MailboxSettings panel** — Malik has never done that, so the 90d backfill has never been queued. He'll connect, see his connection card, navigate away, and nothing will happen.

**Fix:** Move auto-enroll out of the panel (which only fires on view) into a **server-side guard inside `sync-gmail-emails`'s 10-min cron**: when iterating active connections, if `history_id IS NOT NULL` (already past first-run) AND no `email_backfill_jobs` row exists for the connection AND `last_synced_at` is more than 1 hour old (so we don't fight a fresh OAuth flow), fire-and-forget POST `start-email-backfill` with `target_window: "90d"`. This guarantees existing connections get backfilled within 10 minutes regardless of whether anyone visits the settings panel. The localStorage panel guard stays as a UX nicety but is no longer the only trigger.

I'm also keeping the same guard in `sync-outlook-emails` for parity, even though Outlook is parked.

## Issue 2 — `sync-gmail-emails` writes a noisy `email_sync_runs` row every 10 min even when nothing happens

**Live evidence:** 50+ `email_sync_runs` rows, all `fetched=0, inserted=0, status=success`. This pollutes the "Recent syncs" UI in MailboxSettings, makes real backfill summary rows hard to find, and bloats the table unboundedly (~144 rows/day per connection).

**Fix:** In `sync-gmail-emails` (and `sync-outlook-emails`), skip writing `email_sync_runs` when `fetched === 0 AND errors.length === 0 AND mode === 'incremental'`. Real first-run, errors, and any sync that actually moved data still log. Backfill summaries (mode='backfill') unaffected.

## Issue 3 — `sync-gmail-emails-10min` never logs to `cron_run_log`

**Live evidence:** `cron_run_log` has rows for `process-scheduled-emails`, `process-fireflies-retry-queue`, `auto-enrich-ai-tier`, etc. — but **zero** for `sync-gmail-emails`. The function runs (cron.job_run_details proves it), and writes to `email_sync_runs`, but never to `cron_run_log`. So the existing Automation Health panel that reads `cron_run_log` to flag stale jobs cannot see Gmail sync at all. The moment Gmail sync breaks, nobody notices.

**Fix:** Add a single `await logCronRun("sync-gmail-emails", status, totalInserted, { connections, results })` call at the bottom of the Deno.serve handler in `sync-gmail-emails`, mirroring how `sync-outlook-emails` already does (verified: outlook writes to cron_run_log, gmail doesn't). One line, parity restored, Automation Health surfaces it.

## What's verified correct (no fix)

- `backfill-hydrate-every-minute` cron firing reliably with proper Bearer auth ✅
- `sync-gmail-emails-10min` cron firing reliably ✅
- `lead_emails` in `supabase_realtime` publication ✅
- Both metrics triggers (INSERT + UPDATE-of-lead_id) active ✅
- 4-tier matcher (exact / secondary_contacts JSONB / stakeholders / domain-fuzzy) live in all three sync paths ✅
- Progress clamp prevents >100% overshoot ✅
- `BackfillStatusChip` realtime-subscribed, mounted in 3 headers ✅
- `BackfillProgressPanel` filters `superseded`, has localStorage auto-enroll ✅
- `UnmatchedInbox` postgres_changes with debounce + claim-removal ✅
- Sync deferral when backfill active ✅
- First-run neutered (no legacy 1500-msg fetch) ✅
- All dedup indexes, 23505 swallow, INTERNAL_DOMAINS, CRM-loop guards ✅
- `email_sync_runs` summary on backfill `done` ✅
- Outlook code paths inert until secrets added — by your call ✅

## Files touched

- `supabase/functions/sync-gmail-emails/index.ts` — server-side auto-enroll for existing connections (Issue 1); skip writing zero-effect incremental rows to `email_sync_runs` (Issue 2); add `logCronRun` at end (Issue 3).
- `supabase/functions/sync-outlook-emails/index.ts` — same auto-enroll guard for parity (Issue 1); same skip-zero-row behavior (Issue 2). Already logs to cron_run_log.

## Decisions baked in

1. **Auto-enroll trigger placement**: server-side in the existing `sync-gmail-emails` cron, not the UI panel. Guarantees coverage regardless of whether anyone opens settings.
2. **Auto-enroll precondition**: `history_id IS NOT NULL` AND `last_synced_at < now() - 1 hour` AND no prior backfill job. The 1-hour gate prevents fighting a fresh OAuth flow's own auto-fire.
3. **Skip noisy zero rows**: applies to incremental-mode-success-with-no-data only. Errors, first-run, and any non-zero sync still log.

After this build, the moment the next 10-min cron tick fires:
- Malik's existing connection auto-enrolls into a 90d backfill — no need to open settings
- `email_sync_runs` stops accumulating empty rows; only meaningful syncs and backfills appear
- `cron_run_log` finally surfaces Gmail sync status so Automation Health can flag failures
- Everything else (chip, panel, matcher, claim metrics, etc.) keeps working as already shipped

