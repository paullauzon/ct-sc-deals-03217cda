

# End-to-end Gmail integration audit — what's working, what's not, what to do next

## Verified live state (from your Live DB right now)

| Check | Result |
|---|---|
| Mailbox row | `id@captarget.com` — active, has refresh token, label "Captarget" |
| Token freshness | Access token valid until **13:51 UTC**, auto-refreshes before that |
| `last_synced_at` | **13:00:04 UTC** — cron successfully ran the first sync |
| Cron job | `sync-gmail-emails-10min` — `*/10 * * * *`, **active** |
| Cron last 5 runs | **All succeeded** (12:20, 12:30, 12:40, 12:50, 13:00) |
| `lead_emails` (source=gmail) | **1 row** — a Google "Security alert" email to `id@captarget.com`, correctly marked `unmatched` (no lead has that sender) |
| Edge function errors | **None** in `sync-gmail-emails` or `gmail-oauth-callback` |
| `verify_jwt` for Gmail funcs | All 5 set to `false` in `supabase/config.toml` ✅ |

**Diagnosis:** The full pipeline works. Connect → OAuth callback → token storage → cron → token refresh → Gmail API list → fetch → dedupe → internal-domain filter → lead match → insert → update `last_synced_at` — every link in the chain executed correctly during the 13:00 cron tick.

The reason you only see 1 email is exactly what was predicted: `id@captarget.com` is a transactional/admin mailbox with no lead correspondence. The 1 message that did sync is a Google security alert — correctly classified as inbound, correctly stored as `unmatched`. **Behavior is correct.**

## Code audit — confirms last round's improvements deployed

| Improvement | Status in deployed code |
|---|---|
| 90-day first-run window (`FIRST_RUN_WINDOW = "newer_than:90d"`) | ✅ Live in `sync-gmail-emails/index.ts` line 90 |
| Split caps (1500 first-run / 250 incremental) | ✅ Lines 87-88 |
| Domain-fallback matching in `findLeadIdByEmail` | ✅ Lines 184-208 — exact email first, then domain match against `leads.email` and `leads.company_url`, archived/duplicate filtered out |
| 24h health badge in MailboxSettings | ✅ Lines 36-51 |
| Reconnect-required guard logic | ✅ Lines 192-222 — only flags when token expired AND never synced AND >24h old |
| UTF-8-safe state encoding | ✅ Both start and callback use TextEncoder |
| Refresh-token preservation on reconnect | ✅ callback line 156 — falls back to existing row's refresh_token if Google omits it |
| Hard guard against connections with no refresh token | ✅ callback lines 160-165 |
| CRM-sent dedupe (X-CRM-Source header + `<crm-` Message-ID) | ✅ sync lines 383-388 + send lines 131, 197 |
| Pixel open tracking on outbound | ✅ send lines 234-238 |
| Threading via `In-Reply-To` + `References` | ✅ send lines 127-130 |
| `lead_email_metrics` trigger fires on insert | ✅ Verified in DB schema — `update_lead_email_metrics` is a SECURITY DEFINER function |

## What's NOT yet implemented (gaps worth knowing)

These were explicitly deferred in the last plan and remain gaps. None block today's usage but each is a real reliability/UX improvement:

### Gap 1 — `ingest-lead` does not sweep the unmatched bucket
When a new lead is created, existing `lead_emails` rows where `lead_id='unmatched'` whose participants match the new lead's email or company domain are NOT automatically reassigned. So if Malik gets an email today from a prospect who isn't a lead yet, and the lead is created tomorrow, the email stays orphaned in the unmatched bucket forever.

### Gap 2 — No `email_sync_runs` audit table
We can only see "what just happened on this sync" by reading edge function logs. A persistent table (connection_id, started_at, fetched, inserted, matched, errors) would let you see sync history per mailbox in the UI and spot patterns (e.g., "Adam's mailbox failed 3 times this week").

### Gap 3 — No Unmatched Inbox UI
The `lead_emails` table will accumulate `unmatched` rows. There's currently no view to see them, manually claim them to a lead, or delete obvious noise (Google security alerts, calendar invites, etc.).

### Gap 4 — Token expiry early-warning
Because you're still in Google Testing mode, refresh tokens silently expire every 7 days. There's no daily cron flagging "this mailbox token expires in 48 hours" — you'll only notice when sync stops returning data.

### Gap 5 — Outbound from-name uses fragile parsing
`send-gmail-email` extracts the from-name by splitting `user_label` on `—`. If a user labels their mailbox without an em-dash (e.g. `"Adam Captarget"` instead of `"Adam — Captarget"`), the from-name is the whole label. Minor cosmetic, but worth fixing.

### Gap 6 — `window.prompt()` for label is ugly
The Connect Gmail flow uses a browser `prompt()` dialog for the mailbox label. Works, but jarring against the rest of the premium UI.

### Gap 7 — Rate-limit handling
If Gmail returns 429 (rate-limited) during message fetch, we just log "msg X: 429" and move on. We don't pause and retry. Fine at current volumes (1 mailbox, 250 msg/run cap), but will become a problem at 4-5 mailboxes with active backfills.

## Recommended next steps — prioritized

### Priority 1 — Connect Adam's real sales mailbox (no code, just config)
This is the only way to actually validate the matching engine on real data. Until we sync a mailbox that emails leads, we can't prove the lead-linking works in production. Open the published app in Incognito → Settings → Connect Gmail → use Adam's account → click Sync now → check a known lead's Activity tab.

### Priority 2 — Close Gap 1: auto-claim unmatched emails when leads are created
Smallest high-value change. One small block added to `ingest-lead` that runs after a new lead is inserted:
```
UPDATE lead_emails SET lead_id = <new_lead_id>
WHERE lead_id = 'unmatched'
  AND (from_address = <new_lead_email>
    OR <new_lead_email> = ANY(to_addresses)
    OR domainOf(from_address) IN (<new_lead_domains>))
```
This makes the unmatched bucket self-healing as your lead database grows.

### Priority 3 — Build the Unmatched Inbox view
A new tab in Mailbox Settings (or its own settings page) showing all `lead_emails` with `lead_id='unmatched'`, with an inline "claim to lead" picker. Without this, unmatched emails are invisible — they exist in the DB but nobody can act on them.

### Priority 4 — Add `email_sync_runs` audit table
Tiny migration + 4 lines added to `sync-gmail-emails` that insert a row at the end of each connection sync. UI gets a "last 10 syncs" table per mailbox.

### Priority 5 — Replace the `prompt()` label with a proper inline form
Cosmetic — make the Connect Gmail flow feel as premium as the rest of the app.

### Priority 6 — Decide on Google "Testing" mode
Still pending from the previous plan. Until you switch to Internal (Workspace) or Production, every mailbox needs reconnecting every 7 days. You said captarget.com is on Workspace — switching User Type to Internal in Google Cloud Console eliminates this entirely. Zero code changes.

## What I would NOT do right now

- Don't add deeper backfill (>90 days) until we see if 90 actually completes cleanly on Adam's real mailbox
- Don't drop cron frequency below 10 minutes until Adam, Malik, and Valeria are all connected — current load is one mailbox, no need to rush
- Don't add per-user RLS until you decide whether each user should only see their own mailbox or all team mailboxes (this is a product decision, not a tech one)

## Files that would change for Priorities 2, 3, 4, 5

- `supabase/functions/ingest-lead/index.ts` — add unmatched-claim sweep at end of lead insert
- `supabase/functions/sync-gmail-emails/index.ts` — write to `email_sync_runs` at end of `syncOneConnection`
- New migration — create `email_sync_runs` table + index on `connection_id, started_at desc`
- `src/components/MailboxSettings.tsx` — new "Unmatched Inbox" panel + recent sync history per row + replace `prompt()` with inline label input
- New file `src/components/UnmatchedInbox.tsx` (extracted) — list view + "claim to lead" combobox

## Bottom line

The Gmail integration is **production-ready for the happy path**. Pipeline is verified working end-to-end. The right next step is to connect a real sales mailbox (Adam) and watch one full cycle produce real lead-matched emails. Then close Gap 1 (unmatched auto-claim) and Gap 3 (unmatched inbox UI) before connecting the rest of the team — those two together prevent silent data loss as the system scales.

