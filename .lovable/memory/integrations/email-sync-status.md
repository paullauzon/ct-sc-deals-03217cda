---
name: Email Sync Status
description: Phases 1–4 done (Gmail). Outlook per-user OAuth fully built and deployed — awaiting MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET secrets.
type: feature
---

## Gmail — DONE (Phases 1–4)

All Gmail functionality is live: OAuth connect, inbound sync (10min cron), outbound send, reply threading, open-pixel tracking, click rewriting, scheduled send, 90-day backfill.

## Outlook — BUILT, awaiting secrets

**Architecture:** Per-user OAuth (mirrors Gmail exactly). NOT using the Lovable connector — that's single-mailbox only.

**Edge functions deployed:**
- `outlook-oauth-start` — builds Microsoft authorization URL
- `outlook-oauth-callback` — exchanges code, fetches /me profile, stores connection
- `refresh-outlook-token` — refreshes access tokens (Microsoft tokens ~1h)
- `sync-outlook-emails` — per-connection inbox+sentitems pull via Graph, dedup, lead-matching, CRM loop protection
- `send-outlook-email` — Graph /me/sendMail with pixel injection, link rewriting, ai_drafted stamping

**UI updates:**
- `MailboxSettings.tsx` — "Connect mailbox" dropdown with Gmail/Outlook options, provider-aware sync/backfill/refresh routing
- `EmailComposeDrawer.tsx` — loads all active connections (both providers), routes send to correct function based on provider
- `OutlookSetupChecklist.tsx` — deleted (replaced by working OAuth flow)

**Secrets needed to activate:**
- `MICROSOFT_CLIENT_ID` — Azure App Registration → Application (client) ID
- `MICROSOFT_CLIENT_SECRET` — Azure App Registration → Client secret
- Redirect URI in Azure: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`
- Delegated scopes: Mail.Read, Mail.Send, User.Read, offline_access

**Loop protection:** Same pattern as Gmail — `X-CRM-Source: lovable-crm` header + `<crm-{uuid}@domain>` Message-ID on outbound, sync skips messages with either marker.

**Still TODO once secrets are set:**
- pg_cron `sync-outlook-emails-10min` (add after first successful connection test)
- Test end-to-end with a real SourceCo Outlook account

## Disabled function

`supabase/functions/ingest-email/index.ts` is intentionally a no-op returning `410 Gone`. Don't reactivate.
