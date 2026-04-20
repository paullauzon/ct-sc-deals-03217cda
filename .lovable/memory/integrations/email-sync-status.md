---
name: Email Sync Status
description: Phase 1 done — Gmail OAuth + Settings UI live. Outlook still paused pending tenant admin consent.
type: feature
---

## Phase 1 — DONE (this session)

**Gmail OAuth foundation shipped:**
- `gmail-oauth-start` edge function — generates Google consent URL with offline access + scopes (gmail.readonly, gmail.send, gmail.modify, userinfo.email)
- `gmail-oauth-callback` edge function — exchanges code for tokens, fetches user email, upserts into `user_email_connections`. Returns minimal HTML + redirect to settings page.
- `refresh-gmail-token` edge function — exports `getValidAccessToken(connectionId)` helper for sync/send functions, plus standalone HTTP endpoint that refreshes one or all gmail connections.
- `MailboxSettings.tsx` UI mounted at `#sys=crm&view=settings` — Connect Gmail button, table of connected mailboxes, refresh-token + disconnect actions. Settings cog in main nav.
- Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` configured.
- Redirect URI: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback`

## Phase 2 — Inbound sync (next session)

- `sync-gmail-emails` cron (every 10 min) — uses Gmail History API via `history_id`
- Threading/dedup against existing `lead_emails` from Zapier (use `provider_message_id`)
- Auto-match to lead by from/to address
- Decommission Zapier `ingest-email` once parity confirmed

## Phase 3 — Outbound + tracking

- `send-gmail-email` edge function (Gmail `users.messages.send` with base64url RFC 2822)
- Wire `EmailComposeDrawer` to actually send (currently just drafts)
- Open pixel + click rewriter
- "Sent from CRM" filtering to avoid sync-loops

## Phase 4 — Polish

- In-app reply
- Snooze / templates / scheduled send
- Mailbox health monitoring (quota, bounces, quarantine)

## Outlook (still paused)

- `sync-outlook-emails` edge function exists but blocked on sourcecodeals.com Microsoft tenant admin consent + `MICROSOFT_OUTLOOK_API_KEY`
- Will mirror Gmail OAuth pattern when SourceCo IT admin completes consent

## Disabled function

`supabase/functions/ingest-email/index.ts` is intentionally a no-op returning `410 Gone`. Don't reactivate.
