

# Outlook integration — end-to-end verification + what's left

## What's already built and wired (verified in code)

| Layer | Status | File |
|---|---|---|
| OAuth start (Microsoft authorize URL) | ✅ Deployed | `outlook-oauth-start/index.ts` — scopes correct, state encoded, return_to safe-listed |
| OAuth callback (code → tokens → store) | ✅ Deployed | `outlook-oauth-callback/index.ts` — fetches `/me`, upserts row with `provider='outlook'`, handles refresh-token rotation |
| Token refresh (single + bulk) | ✅ Deployed | `refresh-outlook-token/index.ts` — same pattern as Gmail |
| Sync (per-connection inbox+sentitems) | ✅ Deployed | `sync-outlook-emails/index.ts` — Graph API, dedup on `provider_message_id` + `internetMessageId`, lead matching, loop protection via `X-CRM-Source` header + `<crm-…>` Message-ID, logs to `email_sync_runs` + `cron_run_log` |
| Send (Graph `/me/sendMail`) | ✅ Deployed | `send-outlook-email/index.ts` — pre-inserts `lead_emails`, injects open-pixel, rewrites links, stamps `ai_drafted` + `source_draft_id`, marks source draft `sent` |
| `MailboxSettings.tsx` provider-aware UI | ✅ | "Connect mailbox" dropdown → Gmail / Outlook; sync, backfill, refresh all route by `c.provider` |
| `EmailComposeDrawer.tsx` provider-aware send | ✅ | Line 287 routes to `send-outlook-email` vs `send-gmail-email` based on selected mailbox provider |
| `supabase/config.toml` `verify_jwt = false` for all 5 new functions | ✅ | Lines 108–121 |
| `OutlookSetupChecklist.tsx` legacy stub | ✅ Deleted |

## Gap #1 — Secrets (you'll add these when you have Azure)

| Secret | Source |
|---|---|
| `MICROSOFT_CLIENT_ID` | Azure → App registrations → Overview → Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Azure → App registrations → Certificates & secrets → New client secret (value, not ID) |

**Until both are set**, every Outlook function will throw `MICROSOFT_CLIENT_ID missing` or `Microsoft OAuth credentials missing`. Code is already defensive — it returns a clean 500 with the exact missing-secret message, no silent failures.

## Gap #2 — Azure App Registration steps you'll do once

1. Azure Portal → App registrations → New registration
2. Name: "Lovable CRM — Outlook Sync"
3. Supported account types: **Accounts in any organizational directory + personal Microsoft accounts** (multi-tenant) — needed so SourceCo `@sourcecodeals.com` and any future tenant can connect
4. Redirect URI (Web): `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`
5. API permissions → Microsoft Graph → Delegated:
   - `Mail.Read`
   - `Mail.Send`
   - `User.Read`
   - `offline_access`
6. Certificates & secrets → New client secret → copy the **Value** (not the Secret ID)
7. Paste both into Lovable secrets

## Gap #3 — pg_cron job for Outlook (the only remaining build task)

Gmail has a `sync-gmail-emails-10min` cron (set up via direct SQL when first Gmail mailbox connected, lives only in pg_cron — not in migrations). Outlook needs the same:

```sql
SELECT cron.schedule(
  'sync-outlook-emails-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/sync-outlook-emails',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

This will be added the moment your first Outlook mailbox connects successfully (so we don't schedule a job that runs 144x/day and just no-ops).

## Gap #4 — Reply-trigger hook for Outlook inbound (parity with Gmail)

Gmail's `sync-gmail-emails` calls `generate-follow-up-action` for every new inbound reply matched to a `Proposal Sent` / `Negotiating` / `Sample Sent` lead — auto-queues an AI reply draft in the Actions tab.

`sync-outlook-emails` currently inserts to `lead_emails` but does **not** call this hook. Should add the identical post-insert block (8 lines) so SourceCo gets the same auto-draft behavior as Captarget.

## Gap #5 — Sent-folder polling lag note

Outlook Graph `sendMail` returns `202 Accepted` with **no message body** — meaning we can't capture `provider_message_id` at send time (Gmail returns it inline). The next 10-minute sync run picks up the sent message and the dedup logic on `internetMessageId` correctly stitches it to the row we pre-inserted at send time. **No bug — just slower than Gmail by up to 10 min for the row to get its `provider_message_id` populated.** Worth knowing for debugging.

## How you'll test once Azure is wired

1. **Add secrets** → Lovable Cloud → Secrets → add `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`
2. **Smoke test OAuth start** — visit `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-start?user_label=Test` — should return `{ url: "https://login.microsoftonline.com/..." }`
3. **Real connect** — Settings → Mailboxes → "Connect mailbox" → Outlook → enter "Adam — SourceCo" → authorize with Adam's Microsoft account → expect to land back on Settings with toast "Mailbox connected" and a new row showing `adam@sourcecodeals.com` / provider Outlook
4. **First sync** — click the sync icon on the row → expect toast `Synced X — Y new, Z matched`
5. **Backfill** — click "Backfill 90d" → confirms → expect toast with retro-matched lead count
6. **Open a SourceCo lead** in Deal Room → Activities tab → expect to see Adam's actual sent + received Outlook emails interleaved with Calendly/Fireflies events
7. **Reply test** — click Reply on an inbound email → drawer's "From" picker shows Adam's mailbox → send → check Adam's actual Outlook Sent folder for the message → verify `X-CRM-Source: lovable-crm` header is present (View Source in Outlook)
8. **Loop test** — wait 10 min, run sync manually → confirm sent message is **not** re-ingested as a duplicate (header skip works)
9. **AI-draft attribution** — generate an AI follow-up from Actions tab → click "Send" → message lands in Sent folder → in Activities tab the row shows "AI-drafted" badge

## Files I'll touch when you're ready

| File | Change |
|---|---|
| `supabase/functions/sync-outlook-emails/index.ts` | Add reply-trigger post-insert block (Gap #4) |
| pg_cron via SQL | Schedule `sync-outlook-emails-10min` after first connect (Gap #3) |
| `mem://integrations/email-sync-status` | Update status to "live" once tested |

That's literally it — everything else is built and waiting for `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`.

