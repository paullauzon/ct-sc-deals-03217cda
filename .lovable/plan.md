

# Email backfill — capturing ALL historical conversations, reliably

## The honest picture of what we have today

When Malik clicks **Backfill 90d**, `sync-gmail-emails` runs **synchronously inside one edge function call** with these hard caps:

- `MAX_FIRST_RUN = 1500` messages
- `FIRST_RUN_WINDOW = "newer_than:90d"` (Gmail query)
- Outlook: same shape, `receivedDateTime ge now-90d`, 1,500 cap
- No checkpoint / resume — if it crashes at message 1,200 you re-scan from scratch
- Edge function has a CPU + wall-time budget (~150s soft, hard kill after a couple minutes). At ~400ms per `messages.get` call, 1,500 messages is already brushing the ceiling
- The Gmail API gives us message IDs cheaply but **each full-message fetch is one HTTP round trip**. A mailbox with 50,000 historical messages = 50,000 calls

For a Sales Director's mailbox with **years of M&A conversations** this is wrong. We'd capture roughly the last 2–3 months and silently lose everything before that.

## What "ALL emails with ALL prospects" actually requires

Three independent problems, each needing its own answer:

### Problem 1 — Volume

We can't do 50k messages in one edge function call. Period. We need **chunked, resumable backfill** that runs across many invocations and survives restarts.

### Problem 2 — Lead matching against history

Today's matcher only finds leads that **already exist** in the CRM. If Malik emailed a prospect 14 months ago who was never entered as a lead, that thread would land as `lead_id = 'unmatched'` forever. We need a smarter strategy for what to do with those.

### Problem 3 — Surviving close/restart

Edge function dies, browser closes, deploy happens mid-backfill — we cannot lose progress.

## The architecture I recommend

A new dedicated **backfill orchestrator** separate from the daily sync, with three parts:

### Part A — `email_backfill_jobs` table (resumable state machine)

One row per backfill request. Tracks: `connection_id`, `target_window` (90d / 1y / 5y / all), `status` (queued / running / paused / done / failed), `cursor` (Gmail `pageToken` or Outlook `@odata.nextLink`), `messages_discovered`, `messages_processed`, `messages_inserted`, `messages_matched`, `last_error`, `started_at`, `last_chunked_at`. This is the source of truth — even if every edge function dies, the next invocation reads this row and resumes exactly where it left off.

### Part B — Two-phase pipeline

**Phase 1 — Discovery (fast, ID-only).** Walk `messages.list` (Gmail) or `messages` (Graph) page-by-page, store **just the message IDs** into a new `email_backfill_queue` table with `connection_id`, `provider_message_id`, `processed_at NULL`. This is cheap: one API call returns up to 500 IDs, no body fetch. A mailbox of 50k messages discovers in ~100 API calls = ~30 seconds.

**Phase 2 — Hydration (slow, parallel-safe).** A separate worker function pulls N unprocessed IDs from the queue, fetches full bodies, runs lead matching, inserts into `lead_emails`, marks `processed_at`. Runs in chunks of 200 messages per invocation (safely inside the wall-time budget). A pg_cron job invokes the worker every minute until the queue drains.

This means: **clicking "Backfill all-time" enqueues the work in seconds and the system grinds through it on its own, even if Malik closes the browser, even if we deploy, even if the function crashes.** The cron pulls until done.

### Part C — UI feedback ("Backfill progress" panel)

In Mailbox Settings, replace the silent "Backfill 90d" button with a window picker (`90d / 1y / 3y / All time`) and a live progress card showing:

```text
Backfill: malik@captarget.com — All time
[████████░░░░░░░░░░] 12,400 / 47,830 (26%)
12,180 inserted · 4,820 matched to leads · 7,360 unmatched
Started 14m ago · ~38m remaining at current rate
[Pause] [Cancel]
```

Driven by a `select` on `email_backfill_jobs` + queue counts, polled every 5s.

### Part D — Smarter lead matching for the historical haystack

For all-time backfill on a Director's mailbox, ~70% of conversations may be with people who were **never entered as leads** (old prospects, dead deals, internal-to-other-firm chats). Two options:

**D1 (default, conservative):** Park them in `lead_emails` with `lead_id = 'unmatched'` and surface a new **"Unmatched conversations"** view that groups them by `(from_address domain, subject thread)`. Malik can bulk-promote a thread to a new lead with one click. This is the existing `UnmatchedInbox` component, just scaled up — we already have the plumbing.

**D2 (optional, aggressive):** During backfill, if an external sender has **3+ messages exchanged with Malik**, auto-create a "ghost lead" in stage `Closed Lost` with `lost_reason_v2 = 'Stale - imported from email'` so the conversation has a home immediately. Malik can resurrect or archive in bulk later. I'd default this **off** and let you toggle per-backfill.

### Part E — Loop protection at scale

Current dedup uses `provider_message_id`. With 50k inserts that's 50k single-row SELECTs. Switch to **batched dedup**: pull 500 IDs from the queue, do one `select id from lead_emails where provider_message_id in (...)`, skip the dups, batch-insert the rest. ~50× faster.

## What changes for the user

1. Click **Backfill** → choose window (`90d` / `1y` / `3y` / `All time`)
2. Confirmation dialog shows estimated message count + estimated time (Gmail returns `resultSizeEstimate` cheaply)
3. Background job starts. Toast: "Backfill running in background — safe to close this tab"
4. Progress card stays visible in Mailbox Settings + a small chip in the global header (`Backfilling 26%`) that links back to the panel
5. When done, toast: "Backfill complete — 47,830 messages, 4,820 matched to existing leads, 43,010 in Unmatched inbox"
6. Unmatched inbox surfaces the historical conversations, grouped, with bulk-create-lead actions

## Technical details

**New files:**

- `supabase/migrations/<ts>_email_backfill.sql` — `email_backfill_jobs` + `email_backfill_queue` tables with indexes on `(connection_id, processed_at)` and `(status)`
- `supabase/functions/start-email-backfill/index.ts` — UI-invoked. Validates connection, creates `email_backfill_jobs` row, returns job_id. Does NOT block on the actual work.
- `supabase/functions/backfill-discover/index.ts` — Phase 1 worker. Walks message-IDs page by page, inserts into queue, updates `cursor` after each page. Self-reschedules via `pg_net.http_post` to itself if more pages remain (avoids hitting wall-time).
- `supabase/functions/backfill-hydrate/index.ts` — Phase 2 worker. Pulls 200 unprocessed queue rows, batch-dedups, fetches bodies (with `fetchWithRetry` already in the codebase), runs `findLeadIdByEmail`, batch-inserts into `lead_emails`, marks queue rows processed. Updates job counters.
- pg_cron job `backfill-hydrate-every-minute` invoking `backfill-hydrate` when any job has `status = 'running'` and unprocessed queue rows exist
- `src/components/BackfillProgressPanel.tsx` — the live progress card + window picker
- Update `src/components/MailboxSettings.tsx` — replace `backfill90d` button with `<BackfillProgressPanel connection={c} />`

**Provider specifics:**

- **Gmail**: discovery uses `users.messages.list?q=after:YYYY/MM/DD&maxResults=500&pageToken=...`. For "all time" omit the `q`. `resultSizeEstimate` gives a ballpark. Hydration uses the existing `fetchMessage` helper.
- **Outlook/Graph**: discovery uses `/me/messages?$select=id&$top=1000&$orderby=receivedDateTime desc` then follow `@odata.nextLink`. For both folders (Inbox + SentItems) we run two parallel discovery walks. `$count=true` gives the total upfront.

**Rate limiting:**

- Gmail: 250 quota units/sec/user. `messages.get` = 5 units. Safe rate ≈ 50/sec → 200 messages per minute-cron invocation is well under
- Graph: 10k requests per 10 min per app per tenant. 200/min is well under
- The existing `fetchWithRetry` (3 attempts, exponential backoff on 429/503) already handles the burst case

**Safety:**

- Hard idempotency on `(connection_id, provider_message_id)` — re-running a backfill never duplicates
- `email_backfill_jobs.status = 'paused'` halts the cron worker for that job; unpause to resume
- Existing CRM-loop protection (`X-CRM-Source` header / `<crm-...>` Message-ID) already filters our own outbound from being double-counted
- `INTERNAL_DOMAINS` filter still excludes captarget.com / sourcecodeals.com from lead matching

**Observability:**

- Each worker invocation writes to `cron_run_log` with `job_name = 'backfill-hydrate'` and `details = { job_id, processed_in_chunk, queue_remaining }` so the existing Automation Health panel surfaces it
- `email_sync_runs` continues to receive one summary row per completed backfill job

## What I deliberately do not propose

- **Webhook / push subscriptions (Gmail watch, Graph subscriptions).** Useful for live ingestion but the daily cron already handles that. Webhooks don't help backfill.
- **Storing raw RFC822 in object storage.** Not asked for; would balloon storage. We already keep `body_html` and `body_text`.
- **Threading with conversation reconstruction across pre-CRM history.** `thread_id` is already captured per-message; views can group on it later.
- **Backfilling attachments as files.** We capture `hasAttachments` flag; downloading bytes is a separate, much bigger feature.

## Trade-offs to decide before I build

These I'd ask you to pick before I write code:

1. **Default backfill window** when Malik connects: `90d` (current), `1y`, `3y`, or `All time`?
2. **Auto-ghost-lead** behavior (Part D2): off, on, or off-but-prompt-after-backfill-completes with a "Promote 1,240 unmatched threads to ghost leads?" confirmation
3. **Concurrent backfills**: if Malik connects two mailboxes, do both backfills run in parallel, or queue serially? (Parallel is fine technically; serial is gentler on rate limits.)



