

Looking at recent history: pipeline rebuild is complete. Last response shipped Fix 1 (Triage Inbox), Fix 2 (12 files of legacy literals), Fix 3 (DB trigger reattached). Per the original prompt: "this is a very big effort: We need to re-do our pipeline stages... A part of this is the email connection which we will jump to right after this."

So "everything that remains" from the original prompt = **email connection effort**. The memory confirms it: `mem://integrations/email-sync-status` says Outlook deep sync was built but **paused pending tenant admin consent**, and Zapier is currently the only inbound path.

Let me check what's already built vs missing.

## What's already in the DB
- `user_email_connections` table exists (provider, access/refresh tokens, history_id, last_synced_at)
- `lead_emails` table fully wired (direction, threading, opens, clicks, bounces, attachments)
- `lead_email_metrics` aggregation trigger live
- Zapier `ingest-email` edge function active for inbound

## What's missing for full email sync
1. **OAuth flow** — no `connect-email-oauth` / `email-oauth-callback` edge functions exist
2. **Sync cron** — no `sync-outlook-emails` / `sync-gmail-emails` running on a schedule
3. **Outbound send** — no `send-email` edge function (in-app compose exists in `EmailComposeDrawer.tsx` but only saves drafts)
4. **Token refresh** — no refresh handler when `token_expires_at` passes
5. **UI** — no Settings page to connect/disconnect mailboxes; no "connected" indicator in Command Center
6. **Open/click tracking** — pixel + link rewriter not implemented

Given the scope (multi-day effort) and the memory note that **Outlook was paused pending admin consent**, I should clarify direction before building.

# Email Sync — Phase Plan

The original prompt said email is "right after" the pipeline. Pipeline is now done. Email sync is the next big effort and needs phasing across multiple sessions.

## Recommended phases

**Phase 1 — Foundation (this session)**
- OAuth connect flow for Microsoft Graph (Outlook) + Google Gmail
- `email-oauth-start` and `email-oauth-callback` edge functions
- Settings UI to connect/disconnect mailboxes
- Token refresh helper

**Phase 2 — Inbound sync (next session)**
- `sync-outlook-emails` cron (every 10 min, uses delta queries via `history_id`)
- `sync-gmail-emails` cron (history API)
- Threading/dedup against existing `lead_emails` from Zapier (use `provider_message_id`)
- Auto-match to lead by from/to address
- Decommission Zapier path once parity confirmed

**Phase 3 — Outbound + tracking (session 3)**
- `send-email` edge function (Graph `sendMail` / Gmail `send`)
- Wire `EmailComposeDrawer` to actually send (currently just drafts)
- Open pixel + click rewriter
- "Sent from CRM" filtering to avoid sync-loops

**Phase 4 — Polish (session 4)**
- In-app reply
- Snooze / templates / scheduled send
- Mailbox health monitoring (quota, bounces, quarantine)

## Decision needed before I start Phase 1

Which provider should I prioritize? The memory says Outlook was built but paused waiting on **tenant admin consent**. Options:

1. **Microsoft Graph (Outlook) first** — finish what was started, but you need to confirm the Azure app registration is approved by the tenant admin (Malik's IT) so users can grant consent without an admin block.
2. **Gmail first** — simpler OAuth (per-user consent, no admin gate). Faster path to a working sync if Outlook is still blocked.
3. **Both in parallel** — same OAuth scaffolding, double the testing.

I'd also need:
- `MS_CLIENT_ID` + `MS_CLIENT_SECRET` (Azure app registration) — if Outlook
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Google Cloud OAuth client) — if Gmail
- Redirect URI confirmed (likely `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/email-oauth-callback`)

I'll ask which provider to start with so we don't burn a session building the wrong half.

