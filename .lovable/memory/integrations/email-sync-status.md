---
name: Email Sync Status
description: Phases 1–4 done — Gmail OAuth + inbound sync + outbound send + reply threading + open-pixel tracking. Outlook still paused.
type: feature
---

## Phase 1 — DONE

**Gmail OAuth foundation:**
- `gmail-oauth-start` / `gmail-oauth-callback` / `refresh-gmail-token` edge functions
- `MailboxSettings.tsx` UI at `#sys=crm&view=settings` — Connect Gmail, refresh token, disconnect
- Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- Redirect URI: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback`

## Phase 2 — DONE

**Gmail inbound sync:**
- `sync-gmail-emails` edge function (full / incremental / history-reset modes, capped 250 msgs/run)
- pg_cron `sync-gmail-emails-10min` every 10 min
- "Sync now" button per mailbox in Settings
- Dedup against existing `lead_emails` via `provider_message_id` and RFC822 `message_id`
- Internal-domain filter (captarget.com / sourcecodeals.com) before lead matching
- Lead match by exact lowercase `leads.email` against external participants
- Unmatched rows stored with `lead_id='unmatched'`

## Phase 3 — DONE

**Outbound send + loop protection:**
- `send-gmail-email` edge function — `users.messages.send` with multipart/alternative RFC2822
  - Stamps `X-CRM-Source: lovable-crm` header and `<crm-{uuid}@domain>` Message-ID for self-send recognition
  - Threads via `threadId` + `In-Reply-To` / `References` when provided
  - Pre-inserts `lead_emails` row, then sends with pixel injected (id known); backfills `provider_message_id` + `threadId` after Gmail returns
- `EmailComposeDrawer` rewired:
  - Loads active Gmail mailboxes into a "From" picker
  - "Send" button calls `send-gmail-email` with chosen mailbox + lead_id
  - "Copy & mark sent" preserved as fallback when no mailbox connected
  - Send bumps `lastContactDate` and stakeholder `last_contacted`
- Inbound sync now skips messages that have `X-CRM-Source` header or `<crm-` in their Message-ID — prevents double-insertion when our own send shows up in the next inbound pull

**Loop protection summary:** A CRM-sent message is inserted ONCE by `send-gmail-email` at send time. When `sync-gmail-emails` later pulls the same message from Gmail's Sent folder, it is detected by:
1. existing `lead_emails` row (provider_message_id match) → skipped as duplicate, OR
2. `X-CRM-Source: lovable-crm` header → skipped as CRM-sent, OR
3. `<crm-...>` Message-ID prefix → skipped as CRM-sent

## Phase 4 — DONE (this session)

**Reply threading:**
- `EmailComposeDrawer` accepts `replyContext: { to, subject, thread_id, in_reply_to, quote }` and passes `thread_id` + `in_reply_to` to `send-gmail-email` so replies land in the correct Gmail thread
- Inbound `EmailRow` in `EmailsSection` exposes a "Reply" button that prefills To/Subject (Re:) + a quoted body block and the threading IDs
- `LeadDetailPanel` holds the `emailReplyContext` state and routes both Compose (blank) and Reply (prefilled) into the same drawer

**Open-pixel tracking:**
- New `track-email-open` edge function (verify_jwt=false) returns a 1×1 transparent GIF and appends `{at, ua}` to the matching `lead_emails.opens` array
- `send-gmail-email` pre-inserts the `lead_emails` row, then injects `<img src=".../track-email-open?eid={lead_email_id}">` into the recipient HTML before sending — DB row stores the clean HTML, only the wire copy carries the pixel
- Existing DB trigger `update_lead_email_metrics()` recomputes `total_opens` + `last_opened_date` from the array on every update
- `EmailsSection` already renders open/click count badges per outbound email — they now light up automatically when a recipient opens

## Phase 5 — Polish (next session, if needed)

- Click rewriter for link analytics (rewrite href → tracking endpoint that 302s)
- Snooze / templates / scheduled send
- Mailbox health monitoring (quota, bounces, quarantine) in Settings
- Gmail image-proxy detection to suppress send-time false-positive opens
- Retire Zapier `ingest-email` after one week of Gmail parity confirmed

## Outlook (still paused)

- `sync-outlook-emails` edge function exists but blocked on sourcecodeals.com Microsoft tenant admin consent + `MICROSOFT_OUTLOOK_API_KEY`
- Will mirror Gmail OAuth + send + reply + pixel pattern when SourceCo IT admin completes consent

## Disabled function

`supabase/functions/ingest-email/index.ts` is intentionally a no-op returning `410 Gone`. Don't reactivate.
