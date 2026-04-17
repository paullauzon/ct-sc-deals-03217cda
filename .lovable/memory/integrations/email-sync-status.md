---
name: Email Sync Status
description: Both brands waiting on admin approvals for native Outlook/Gmail sync — no interim Zapier path (abandoned as too fiddly)
type: feature
---

## Current state

**No active email sync for either brand.** Zapier interim bridge was considered and abandoned — too much per-rep setup overhead and ongoing maintenance for a temporary solution. We wait for proper OAuth.

### Captarget (Gmail)
- **Blocked on**: captarget.com Google Workspace admin (Adam is NOT admin) to set up Google Cloud OAuth project in **Internal** mode
- Admin instructions delivered to user; awaiting credentials (Client ID + Secret)
- When credentials arrive: build Gmail OAuth flow + per-user `user_email_connections` rows + `sync-gmail-emails` cron

### SourceCo (Outlook)
- **Blocked on**: sourcecodeals.com Microsoft tenant admin consent for Microsoft Graph scopes (`Mail.Read`, `Mail.Send`, ideally `Mail.Read.All` for tenant-wide)
- `sync-outlook-emails` edge function already built and ready — needs `MICROSOFT_OUTLOOK_API_KEY` connector secret + cron schedule
- When consent lands: enable cron, function pulls Inbox + Sent for connected mailbox(es)

## Disabled function

`supabase/functions/ingest-email/index.ts` is intentionally a no-op returning `410 Gone`. Don't reactivate unless Zapier path is explicitly revived.

## When OAuth lands — switch-on checklist

**Outlook (likely first):**
1. Connect Microsoft Outlook via Connectors (provides `MICROSOFT_OUTLOOK_API_KEY`)
2. Schedule `sync-outlook-emails` via pg_cron (every 5 min recommended)
3. Verify emails landing in `lead_emails` with `source: "outlook"`
4. For multi-rep: either tenant-wide app permission OR per-user OAuth flow writing to `user_email_connections`

**Gmail (when Captarget admin delivers):**
1. Store Client ID + Secret in secrets
2. Build `gmail-oauth-callback` edge function + per-user OAuth flow
3. Build `sync-gmail-emails` mirroring `sync-outlook-emails` shape
4. Schedule via pg_cron

## Why no Zapier

- Per-rep Zap setup (~15 min × N reps) doesn't scale
- Ongoing Zapier task quota cost (~$30-69/mo) for a temporary solution
- Can't deliver opens/clicks tracking or in-app send anyway
- Switch-over still requires the same OAuth work — Zapier just delays it
- Cleaner to wait, ship the real thing once, and skip the throwaway integration
