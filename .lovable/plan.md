

User wants to continue Gmail email sync. Phase 1 (OAuth foundation) is done. Next phases per the established plan:

**Phase 2 — Inbound sync** (this session)
**Phase 3 — Outbound + tracking** (after Phase 2)
**Phase 4 — Polish** (later)

Phase 2 is the next logical step. Let me scope it tightly so it actually ships in one session.

# Phase 2 — Gmail inbound sync

## What gets built

### 1. `sync-gmail-emails` edge function
For each active Gmail connection in `user_email_connections`:
- Get valid access token via existing `getValidAccessToken()` helper
- **First run** (no `history_id`): pull last 7 days via `users.messages.list?q=newer_than:7d`, store latest `historyId` for next run
- **Incremental run** (has `history_id`): call `users.history.list?startHistoryId=X` to get only new message IDs since last sync, then fetch each via `users.messages.get?format=metadata` + payload
- Parse RFC2822 headers (From, To, Cc, Subject, Date, Message-ID, In-Reply-To)
- Extract plain + HTML body parts (base64url decode)
- Determine direction: `outbound` if From matches the connected mailbox's `email_address`, else `inbound`
- Match to lead by external participants (skip captarget.com/sourcecodeals.com)
- **Dedup against Zapier rows**: check `provider_message_id = msg.id OR message_id = rfc822_message_id` in `lead_emails` before inserting
- Insert into `lead_emails` with `source = 'gmail'`
- Update connection's `history_id` and `last_synced_at`
- Return summary `{ processed, inserted, matched, skipped_dup }`

### 2. Schedule via pg_cron
Every 10 minutes:
```sql
SELECT cron.schedule('sync-gmail-emails-10min', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/sync-gmail-emails',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

### 3. UI — Manual sync + status in `MailboxSettings.tsx`
- Add "Sync now" button per connection row → calls `sync-gmail-emails` with `{ connection_id }`
- Show last synced relative time (already in DB, just render it)
- Toast result: "Synced 12 emails, 8 matched to leads"

### 4. Zapier deprecation note
Don't touch Zapier yet — leave both pipes running for one week of parity. Gmail rows will be marked `source='gmail'`, Zapier rows stay `source='zapier'`. Dedup logic prevents doubles. After Malik confirms Gmail parity in 7 days, we flip Zapier off in a follow-up session.

## Files

| File | Action |
|---|---|
| `supabase/functions/sync-gmail-emails/index.ts` | Create |
| `supabase/config.toml` | Add `[functions.sync-gmail-emails] verify_jwt = false` |
| `src/components/MailboxSettings.tsx` | Add "Sync now" button + last-synced display |
| pg_cron schedule | Insert via SQL |
| `mem://integrations/email-sync-status.md` | Update — Phase 2 done |

## Out of scope (Phase 3)
- Sending email from CRM (`send-gmail-email`)
- Open pixels / click rewriter
- Wiring `EmailComposeDrawer` to actually send
- Retiring Zapier `ingest-email`
- Outlook OAuth

## Risk + mitigation
- **Gmail History API gaps**: history records can be pruned after ~7 days. If `historyId` is too old, Google returns 404 — function falls back to a 7-day full-scan and logs the reset.
- **Token refresh**: already handled by `getValidAccessToken()` helper from Phase 1.
- **Internal-only threads**: filtered out before lead-match attempt (avoids unmatched noise).
- **Rate limits**: Gmail allows 1B quota units/day per project — well above our needs. Per-user we cap at 250 messages per sync run to avoid runaway cost.

