

# Outlook integration: surface it and finish the activation

## Current state — already 100% built

| Component | Status |
|---|---|
| `outlook-oauth-start` edge function | ✓ Deployed |
| `outlook-oauth-callback` edge function | ✓ Deployed |
| `refresh-outlook-token` edge function | ✓ Deployed |
| `sync-outlook-emails` edge function (with hardened matcher + auto-stakeholder + system-noise guard) | ✓ Deployed |
| `send-outlook-email` edge function (with pixel + click tracking + loop protection) | ✓ Deployed |
| `MailboxSettings.tsx` "Connect Outlook" dropdown | ✓ Live in UI |
| `EmailComposeDrawer.tsx` provider routing | ✓ Live |
| `BackfillProgressPanel` provider-aware | ✓ Live |
| Cron `sync-outlook-emails-10min` | Pending — added after first connection succeeds |
| `MICROSOFT_CLIENT_ID` secret | ❌ Not set |
| `MICROSOFT_CLIENT_SECRET` secret | ❌ Not set |
| Azure App Registration | ❌ User action required |

**Translation:** The integration is fully ready. The only missing pieces are the Microsoft credentials and the matching Azure app registration. There is no further code to write — everything has already been hardened to the same standard as Gmail.

## What needs to happen — 3 steps

### Step 1 — User registers the app in Microsoft Entra (5 min, user-side)

I'll walk you through the Azure portal exactly, but the agent cannot do this for you. You'll need:

1. Go to **Microsoft Entra admin center** → **App registrations** → **New registration**
2. Name: `SourceCo CRM Outlook Sync` (or anything)
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant + personal — covers any Outlook account you'd want to connect)
4. Redirect URI (Web): `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`
5. After creation: **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → check `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access` → **Add**. Click **Grant admin consent** if it's your tenant's admin account.
6. **Certificates & secrets** → **New client secret** → 24 month expiry → copy the **Value** (not the ID) immediately
7. Copy the **Application (client) ID** from the Overview page

### Step 2 — Add the two secrets to Lovable Cloud

I'll prompt you with `add_secret` for both:
- `MICROSOFT_CLIENT_ID` — the Application (client) ID
- `MICROSOFT_CLIENT_SECRET` — the secret Value

### Step 3 — Connect a mailbox + activate cron

1. You go to **Settings → Mailboxes** → **Connect mailbox** → **Connect Outlook**, enter a label (e.g. "Malik Outlook"), authorize via Microsoft
2. Connection lands in `user_email_connections` with `provider='outlook'` and a refresh token
3. Auto-backfill kicks off (90d default — you can choose 1y/3y/all in the BackfillProgressPanel after connect)
4. I add `sync-outlook-emails-10min` pg_cron job so ongoing sync runs alongside Gmail
5. I add the connection to the `sync-watchdog` monitoring (already monitors all active connections — Gmail and Outlook both)
6. I update the memory file to mark Outlook as **LIVE**

## What you get the moment a mailbox connects

- **Inbound + outbound sync every 10 min** via Microsoft Graph `/me/messages` and `/me/mailFolders/sentitems/messages`
- **Same hardened 4-tier matcher** as Gmail — primary → secondary → stakeholder → corporate-domain-with-confirmed-participant
- **Same blocklists** — personal providers (gmail/yahoo/google/apple/etc) excluded from Tier 4, system-noise senders skipped
- **Auto-stakeholder discovery** on Tier 4 matches (passive coverage expansion)
- **Composer routing** — Compose Drawer already loads all active connections; "From" picker auto-shows Outlook accounts and routes through `send-outlook-email`
- **Loop protection** — `X-CRM-Source: lovable-crm` header + `<crm-{uuid}@domain>` Message-ID on outbound prevents the sync from re-ingesting our own sends
- **Watchdog** — alerts if Outlook sync stalls >30 min, identical to Gmail
- **90d / 1y / 3y / all-time backfill** — same `start-email-backfill` machinery, provider-aware

## Files (confirmation — no NEW code, just secrets + cron + memory)

- **NO CODE CHANGES** to any edge function or component. Everything is built.
- After secrets are added: invoke a SQL migration to register the `sync-outlook-emails-10min` pg_cron job
- Update `mem://integrations/email-sync-status` to mark Outlook as LIVE

## What I'll do right now after you approve

1. Send `add_secret` requests for `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` with clear copy-paste instructions for Azure
2. Wait for both secrets to land
3. Tell you to click **Connect Outlook** in Settings → Mailboxes
4. The moment your first connection appears in `user_email_connections`, I'll add the pg_cron job and verify the first sync run
5. Report back with first-sync results (fetched / matched / unmatched counts) so we can validate Outlook routing accuracy the same way we did for Gmail

