---
name: Email Sync Status
description: Gmail and Outlook deep sync both LIVE. Outlook scoped to SMC SourceCo tenant via MICROSOFT_TENANT_ID, syncing every 5 min.
type: feature
---

## Gmail — LIVE

OAuth connect, 10-min cron inbound sync, outbound send, reply threading, open-pixel tracking, click rewriting, scheduled send, 90-day backfill.

## Outlook — LIVE

**Architecture:** Per-user OAuth scoped to a single Microsoft tenant (SMC SourceCo, LLC). NOT using the Lovable connector — that's single-mailbox only.

**Tenant scoping:** OAuth endpoints use `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/...` instead of `/common/`. This bypasses the global-admin consent requirement so any user in Josh's tenant can grant personal mailbox access. Falls back to `common` if the secret is missing (non-working but non-crashing).

**Edge functions:**
- `outlook-oauth-start` — authorize URL (tenant-scoped)
- `outlook-oauth-callback` — token exchange + /me profile fetch + auto-dispatch 90d backfill
- `refresh-outlook-token` — refreshes access tokens (~1h Microsoft TTL)
- `sync-outlook-emails` — per-connection inbox+sentitems pull via Graph, dedup, lead-matching, CRM loop protection. **Cron: every 5 min (`sync-outlook-emails-5min`)**.
- `send-outlook-email` — Graph /me/sendMail with pixel injection, link rewriting, ai_drafted stamping

**UI:**
- `MailboxSettings.tsx` — "Connect mailbox" dropdown with Gmail/Outlook, provider-aware sync/backfill/refresh routing
- `EmailComposeDrawer.tsx` — loads all active connections, routes send to correct function based on provider

**Required secrets (all set):**
- `MICROSOFT_CLIENT_ID` — Azure App Registration → Application (client) ID
- `MICROSOFT_CLIENT_SECRET` — Azure App Registration → Client secret
- `MICROSOFT_TENANT_ID` — Directory ID for SMC SourceCo tenant
- Redirect URI in Azure: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`
- Delegated scopes: Mail.Read, Mail.Send, User.Read, offline_access

**Loop protection:** Same pattern as Gmail — `X-CRM-Source: lovable-crm` header + `<crm-{uuid}@domain>` Message-ID on outbound, sync skips messages with either marker.

**Multi-tenant note:** Single-tenanted to SMC SourceCo intentionally. If another tenant ever needs to connect → add a second app registration or fall back to `/common/` after global-admin consent.

## Disabled function

`supabase/functions/ingest-email/index.ts` is intentionally a no-op returning `410 Gone`. Don't reactivate.
