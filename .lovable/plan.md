

# Email backfill — final 5 gaps before Malik connects

I traced every piece against the live database and code. Architecture is **complete and sound**. Cron is firing every minute. All 6 prior gaps are coded and migrated. But **5 concrete issues remain** that will show up the moment Malik connects on his real mailbox. None are deep — all are surgical.

## Gap A — `superseded` status ignored by hydrate worker (data orphan risk)

`pickJobs` in `backfill-hydrate` selects only `status IN ('running','discovering')`. Discover correctly skips `superseded` jobs (line 240). Good. But `start-email-backfill` marks the OLD job `superseded` and inserts a NEW one. The old job's queue rows (`email_backfill_queue` with that `job_id`) still have `status='pending'` — **they are now orphaned forever** because no job picks them up, and the cron worker never sees them.

For Malik this means: auto-90d fires on connect → discovery enqueues 8,000 IDs → 30 seconds in he clicks "All time" → old job marked superseded → 7,500 still-pending queue rows are abandoned. The new job re-discovers them (idempotent dedup on queue's `(connection_id, provider_message_id)` will reject the inserts), so they never get hydrated.

**Fix:** When superseding old jobs, also `UPDATE email_backfill_queue SET status='superseded', processed_at=now() WHERE job_id IN (...) AND status='pending'`. The new job re-enqueues them under its own `job_id`.

## Gap B — `BackfillProgressPanel` only loads the latest job — supersede UX is wrong

Panel does `.order('started_at', desc).limit(1)`. After a supersede, the latest job is the new one (correct). But while the supersede is happening, polling can race and show stale "active" state for the old `superseded` row. Also the panel never shows `"superseded"` as a label so the user sees `superseded` raw.

**Fix:** Filter out `superseded` from the latest-job query (`not.in('status', '("superseded")')`), and add a `superseded` label fallback in `renderStatusLabel`.

## Gap C — Auto-fire 90d on connect double-fires when reconnecting

`gmail-oauth-callback` fires `start-email-backfill` whenever `connectionId` exists. If Malik reconnects (token expired, revoked, switched accounts) the callback runs again, kicks a NEW 90d auto-backfill, which now supersedes anything in flight — wasting work and re-walking 90 days. Same for Outlook.

**Fix:** Only auto-fire when the connection is **brand new**: check whether any `email_backfill_jobs` row exists for that `connection_id`. If yes, skip the auto-fire (Malik can re-trigger from the panel). One-line guard in both callbacks.

## Gap D — Legacy "Backfill 90d" path on `sync-gmail-emails` still alive and conflicting

`sync-gmail-emails` still has the old `force_full=true` 1,500-message synchronous backfill (line 672–693). Nothing in the UI calls it now (verified — `MailboxSettings` only invokes the new `BackfillProgressPanel`). But the cron `sync-gmail-emails-10min` runs every 10 minutes and on a connection with `history_id IS NULL` (which is the state immediately after OAuth, before the auto-90d backfill writes one), it triggers the legacy 90d sync — racing the new backfill, double-inserting (idempotent so harmless duplicates) but **chewing Gmail quota** and writing confusing `email_sync_runs` rows with `mode='first_run'` that compete with the backfill's `mode='backfill'` row.

**Fix:** In `sync-gmail-emails`'s `syncOneConnection`, if the connection has no `history_id`, **just call `getMailboxProfileHistoryId` and persist it without fetching messages** — let the backfill orchestrator own first-run. Same fix in `sync-outlook-emails`: if `last_synced_at IS NULL` and there's an active backfill job, skip the full sync and only stamp `last_synced_at = now()` so subsequent incremental syncs run normally.

## Gap E — No "global progress chip" so Malik loses sight of the backfill

The original plan promised: *"a small chip in the global header (`Backfilling 26%`) that links back to the panel"*. Today the panel only renders inside `MailboxSettings`, which lives behind Settings → Email. Malik connects, sees the toast, clicks anywhere in the app and the progress disappears from view. He'll think it stopped.

**Fix:** Tiny `BackfillStatusChip.tsx` mounted in the global header (`SystemSwitcher` or near `UserMenu`). Polls `email_backfill_jobs` for any row with status in `('queued','discovering','running')` every 15s. If found, renders a compact pill: `Backfilling 26% · malik@captarget.com` that links to `#view=settings` and opens the Mailboxes tab. Hides itself when no active job. Costs one cheap query every 15s.

## What's verified correct (no fix needed)

- Cron `backfill-hydrate-every-minute` is **active** with proper Bearer auth ✅
- Self-reschedule chain (discover → discover, discover → hydrate, hydrate → hydrate) ✅
- Queue dedup `uq_backfill_queue_conn_msg` + lead_emails dedup `uq_lead_emails_provider_message` ✅
- `message_id` UNIQUE dropped, replaced with non-unique `idx_lead_emails_message_id` ✅
- Gmail discovery excludes `-in:spam -in:trash` ✅
- Outlook discovery walks `/me/messages` (all folders, drafts excluded) ✅
- OAuth callbacks auto-fire 90d backfill ✅
- Concurrent-job guard supersedes instead of 409 ✅
- `email_sync_runs` summary written on `done` ✅
- 23505 treated as skip on insert ✅
- Token refresh inline in both discover + hydrate ✅
- `INTERNAL_DOMAINS` filter + CRM-loop protection ✅
- Pause / Resume / Cancel wired and respected ✅
- Unmatched inbox renders `lead_id='unmatched'` with bulk lead promotion ✅

## Files touched

- `supabase/functions/start-email-backfill/index.ts` — also mark old jobs' pending queue rows as `superseded` (Gap A)
- `src/components/BackfillProgressPanel.tsx` — exclude `superseded` from latest-job query, add label (Gap B)
- `supabase/functions/gmail-oauth-callback/index.ts` — guard auto-fire behind "no prior backfill jobs" check (Gap C)
- `supabase/functions/outlook-oauth-callback/index.ts` — same guard (Gap C)
- `supabase/functions/sync-gmail-emails/index.ts` — when `history_id IS NULL`, just stamp profile historyId without fetching messages (Gap D)
- `supabase/functions/sync-outlook-emails/index.ts` — when `last_synced_at IS NULL` AND an active backfill job exists, just stamp `last_synced_at` (Gap D)
- **New** `src/components/BackfillStatusChip.tsx` — global header progress pill (Gap E)
- `src/App.tsx` or wherever the global header chrome lives — mount `<BackfillStatusChip />` (Gap E)

## Decisions before I build (sensible defaults)

1. **Supersede orphan handling**: cancel the old queue rows (Gap A fix). Yes — anything else leaks rows forever.
2. **Reconnect auto-fire**: skip auto-fire if any prior backfill job exists for the connection. User can manually click in panel.
3. **Global chip placement**: in the system header next to `UserMenu` so it's visible from every page.
4. **Legacy `force_full` path**: leave the code path for now (in case we want manual "re-run last 90d" later); just neuter the auto-trigger when `history_id IS NULL`.

After this build, the moment Malik clicks "Connect Gmail":
- 90d auto-backfill starts in the background
- A chip appears in the header showing live progress from any page
- He can widen to All time and the old job + queue rows are cleanly superseded (no orphans, no dup work)
- The legacy 10-min sync stops racing the backfill on first connect
- Closing the tab, navigating away, deploying mid-backfill — none of it interrupts the work
- When done, summary lands in `email_sync_runs` and the chip disappears

