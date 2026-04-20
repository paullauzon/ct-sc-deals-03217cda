

# Email backfill — closing the last 6 gaps before Malik connects

The architecture is **structurally complete**: tables, indexes, edge functions, cron, UI panel, dedup, idempotency, and self-rescheduling all wired. But there are **6 concrete gaps** that will bite the moment Malik runs an "All time" backfill on a real mailbox. All are surgical fixes.

## Gap 1 — `lead_emails.message_id` UNIQUE constraint will hard-fail at scale

**Evidence:** `lead_emails_message_id_key` is a UNIQUE index on `message_id`. The Outlook hydrator writes `message_id: internetMsgId || r.provider_message_id` — fine. But the Gmail hydrator writes `message_id: rfc822 || null`. For 10–20% of historical Gmail messages the `Message-ID` header is missing or duplicated across forwarded/threaded mails. The first NULL is fine, but two NULLs collide on some Postgres index variants, and **non-null duplicates** (e.g., the same RFC822 ID present in both Inbox and Sent for a self-cc'd email) will throw `23505` — and the current code only treats `23505` as a skip when it's on `provider_message_id`, not when it's on `message_id`. Backfill silently aborts that batch.

**Fix:** Drop `lead_emails_message_id_key` (it's redundant — `provider_message_id` is the real idempotency key). Add a non-unique index on `message_id` for lookups. One migration.

## Gap 2 — Gmail discovery only walks INBOX label, missing Sent / All Mail

**Evidence:** `discoverGmail` calls `users.messages.list` with no `labelIds` filter. Gmail's default for `messages.list` returns messages in INBOX + SENT + drafts + spam + trash UNLESS otherwise scoped — but **all messages a user sees** live under `All Mail` (label `INBOX` is just a view). The Gmail list endpoint with no label correctly returns all messages by default, but we need to **explicitly exclude SPAM and TRASH** or we'll import 10k spam messages as "unmatched conversations" and pollute the inbox.

**Fix:** Add `q=-in:spam -in:trash` (combined with the date filter when present) to `discoverGmail`. One-line change.

## Gap 3 — Outlook discovery skips Archive folder + custom folders entirely

**Evidence:** `discoverOutlook` walks only `inbox` and `sentitems`. M&A directors aggressively archive — most historical conversations live in `archive` or custom folders like "Deals 2023". Those threads will be invisible to the backfill.

**Fix:** Replace the two-folder walk with a single walk against `/me/messages` (no `mailFolders/{id}` prefix) which returns **every message in the mailbox across all folders**. This is what the Microsoft Graph docs recommend for full-mailbox sync. Add `$filter=isDraft eq false` to skip drafts. Track a single `discovery_cursor` (drop the `discovery_cursor_sent` field's role for Outlook — it stays for Gmail-style multi-cursor compat but goes unused for Outlook).

## Gap 4 — No "first send for connection" auto-trigger

**Evidence:** `gmail-oauth-callback` and `outlook-oauth-callback` create the `user_email_connections` row but never enqueue a backfill job. Malik connects → sees nothing → has to manually click Backfill → pick a window. The UX should be: connect → toast "Importing your last 90 days in the background" → progress chip appears.

**Fix:** At the end of both OAuth callbacks, fire-and-forget POST to `start-email-backfill` with `target_window: "90d"`. If Malik wants more history, he picks a longer window from the panel (which will queue a SECOND job — see Gap 5).

## Gap 5 — Concurrent-job guard is too strict

**Evidence:** `start-email-backfill` rejects with HTTP 409 if any job for that connection has status in `(queued, discovering, running, paused)`. So if the auto-90d (Gap 4) is still running and Malik clicks "Backfill all time", he gets an error instead of "we'll widen the window when the current one finishes". 

**Fix:** When starting a new job and a 90d job is still running for the same connection, **mark the old job `superseded`** and create the new one. (Idempotent dedup on `(connection_id, provider_message_id)` means we don't re-fetch what's already in `lead_emails`.) Add `"superseded"` to the allowed status set; hydrator already skips non-`running` jobs.

## Gap 6 — `email_sync_runs` summary row never written when backfill completes

**Evidence:** Plan promised "`email_sync_runs` continues to receive one summary row per completed backfill job" so the existing per-connection sync history table shows it. The hydrate function writes to `cron_run_log` (good, for Automation Health) but **never inserts an `email_sync_runs` row** when a job flips to `done`. Result: Malik's "Show recent syncs" dropdown in MailboxSettings will not show the backfill at all.

**Fix:** When `isComplete && discovery_complete && status` flips to `done` in `backfill-hydrate`, INSERT one row into `email_sync_runs` with `mode = 'backfill'`, `fetched = messages_processed`, `inserted = messages_inserted`, `matched = messages_matched`, `started_at` from job, `finished_at = now()`, and `connection_id`.

## What's already correct (verified)

- `pg_cron` job `backfill-hydrate-every-minute` is **active** ✅
- Unique indexes `uq_backfill_queue_conn_msg` and `uq_lead_emails_provider_message` enforce idempotency ✅
- Self-reschedule chain in both discover + hydrate survives wall-time limits ✅
- `INTERNAL_DOMAINS` filter excludes captarget.com / sourcecodeals.com ✅
- CRM-loop protection (`X-CRM-Source` + `<crm-...>` Message-ID) skips our own outbound ✅
- Pause/Resume/Cancel UI wired and respects status in worker ✅
- Token refresh inline (no dependence on separate cron) ✅
- BackfillProgressPanel polls every 5s while job is active ✅

## Files touched

- **New migration**: `supabase/migrations/<ts>_email_backfill_polish.sql` — drop `lead_emails_message_id_key` UNIQUE, add non-unique `idx_lead_emails_message_id`
- `supabase/functions/backfill-discover/index.ts` — Gmail spam/trash exclusion, Outlook full-mailbox walk
- `supabase/functions/backfill-hydrate/index.ts` — write `email_sync_runs` row on completion, treat `23505` on any column as skip
- `supabase/functions/start-email-backfill/index.ts` — supersede running 90d jobs instead of 409
- `supabase/functions/gmail-oauth-callback/index.ts` — auto-fire 90d backfill on connect
- `supabase/functions/outlook-oauth-callback/index.ts` — auto-fire 90d backfill on connect

## Decisions before I build (sensible defaults)

1. **Auto-90d on connect**: ON (Gap 4). Malik can widen later from the panel.
2. **Auto-ghost-lead** (D2 from original plan): still **off**, surface in Unmatched inbox with bulk-promote (current behavior).
3. **Concurrent backfills across mailboxes**: **parallel** (cron picks up to 3 active jobs). Same-mailbox jobs supersede.

After this build, the moment Malik clicks "Connect Gmail" → 90d auto-imports in the background → he sees the progress card → he can widen to All time → it Just Works, even if he closes the tab, even if we deploy mid-backfill.

