---
name: Email Sync Status
description: Phase 1 + 2 done — Gmail OAuth + inbound sync live (cron 10min). Outbound (Phase 3) and Outlook still ahead.
type: feature
---

## Phase 1 — DONE

**Gmail OAuth foundation:**
- `gmail-oauth-start` / `gmail-oauth-callback` / `refresh-gmail-token` edge functions
- `MailboxSettings.tsx` UI at `#sys=crm&view=settings` — Connect Gmail, refresh token, disconnect
- Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Redirect URI: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback`

## Phase 2 — DONE (this session)

**Gmail inbound sync shipped:**
- `sync-gmail-emails` edge function
  - First run: `messages.list?q=newer_than:7d` (capped 250 per run)
  - Incremental: `users.history.list?startHistoryId=X&historyTypes=messageAdded`
  - 404 fallback: history pruned → resets to 7-day full scan, logs `mode='history-reset'`
  - Stores `historyId` from `users.profile` after full runs
  - Parses RFC2822 headers (From/To/Cc/Bcc/Subject/Date/Message-ID), base64url decodes plain + html parts
  - Direction = outbound if From matches mailbox address, else inbound
  - Lead match: exact lowercase `leads.email` against external participants (skips own address + captarget.com / sourcecodeals.com)
  - Unmatched rows stored with `lead_id='unmatched'` (consistent with existing Zapier behavior)
  - Dedup: `provider_message_id = msg.id OR message_id = rfc822_id` against `lead_emails` before insert
  - Inserted rows tagged `source='gmail'`
- pg_cron `sync-gmail-emails-10min` runs every 10 min (uses anon key, function has `verify_jwt=false`)
- "Sync now" button per mailbox in `MailboxSettings.tsx` — calls function with `connection_id`, toasts `fetched / inserted / matched / skipped_dup`

**Parity period:** Zapier `ingest-email` (currently a no-op `410 Gone`) stays disabled. Existing Zapier-sourced rows (`source='zapier'`) are preserved and dedup logic prevents doubles when Gmail backfills the same thread. Run for one week, then officially retire Zapier.

## Phase 3 — Outbound + tracking (next session)

- `send-gmail-email` edge function (Gmail `users.messages.send` with base64url RFC 2822)
- Wire `EmailComposeDrawer` to actually send (currently just drafts)
- Open pixel + click rewriter
- "Sent from CRM" filtering to avoid sync-loops (X-CRM-Source header → skip in dedup or always insert as outbound)

## Phase 4 — Polish

- In-app reply
- Snooze / templates / scheduled send
- Mailbox health monitoring (quota, bounces, quarantine)

## Outlook (still paused)

- `sync-outlook-emails` edge function exists but blocked on sourcecodeals.com Microsoft tenant admin consent + `MICROSOFT_OUTLOOK_API_KEY`
- Will mirror Gmail OAuth pattern when SourceCo IT admin completes consent

## Disabled function

`supabase/functions/ingest-email/index.ts` is intentionally a no-op returning `410 Gone`. Don't reactivate.
