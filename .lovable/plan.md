

# Connect your Outlook mailbox now that admin consent is granted

## What just changed

Microsoft sent the "Lovable CRM — Outlook Sync access request **Approved**" notice. That clears the tenant-level wall. The CRM-side infrastructure is already built and waiting:

- `outlook-oauth-start` / `outlook-oauth-callback` — ready
- `sync-outlook-emails` — deployed, **running every 5 minutes via cron** (`sync-outlook-emails-5min`)
- `refresh-outlook-token` — deployed (refreshes on demand inside sync)
- `start-email-backfill` — auto-fires a 90-day backfill the moment the connection is created
- `sync-watchdog-hourly` — will alert if the new connection ever stalls >30 min

Database check just now: zero Outlook connections exist yet (`user_email_connections` returns 0 rows for `provider='outlook'`). So nothing is broken — you simply haven't completed your own user-level connect since the wall came down.

## What you do next (3 minutes)

### Step 1 — Connect your Outlook
Settings → Mailboxes → **Connect mailbox** → **Connect Outlook** → enter a label like "SourceCo inbox" → Continue.

You'll be redirected to Microsoft. Because the tenant is approved:
- **You will NOT see the red "Approval required" wall**
- You'll see the standard Microsoft consent screen listing 4 permissions (`Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`)
- Click **Accept**
- Microsoft redirects back to the CRM and you'll see "Mailbox connected" toast

### Step 2 — What happens automatically
The instant the callback completes:

1. The connection row is written with `is_active=true` and a refresh token
2. A 90-day backfill kicks off in the background (`start-email-backfill` → `backfill-discover` → `backfill-hydrate`) — this pulls every Inbox + Sent message from the last 90 days, dedupes against existing rows, and matches each one to a lead
3. From minute 5 onwards, the cron `sync-outlook-emails-5min` keeps it warm — every new inbound/outbound message lands in the CRM within 5 minutes
4. Auto-stakeholder discovery runs on each matched email — same-domain colleagues uncovered through reply chains get added to the lead's stakeholder list
5. Reply detection stamps `replied_at` on outbound CRM emails when the prospect replies, which the Pipeline Health and Engagement signals depend on

### Step 3 — How you verify it worked

In Settings → Mailboxes you'll see a row with:
- Status: **Active** (green check)
- A live count of "X in last 24h" that climbs as backfill chews through your history
- A "Show recent syncs" toggle that lists the cron's 5-minute heartbeats

Then jump to a recent deal you've been emailing through Outlook — the email thread should appear in the deal's Emails tab within ~10 minutes (Sent items take one full sync cycle). For a lived-in inbox like SourceCo, the 90-day backfill typically pulls 500–1,500 messages and finishes in 10–30 minutes.

## Why I'm not making any code changes

Everything required is already deployed and scheduled. The only missing piece was the tenant approval, which is now done. Adding code now would just add risk — there's nothing to build. The plan is purely operational:

1. You click Connect Outlook
2. You click Accept on Microsoft's consent screen  
3. Watch the backfill numbers climb in Settings → Mailboxes

## If anything goes wrong on retry (rare, but here's the fallback map)

| What you see | What it means | What to do |
|---|---|---|
| Normal Microsoft consent screen → Accept → "Connected" toast | ✅ Working as expected | Done |
| "Approval required" wall again | Josh approved a different tenant or the approval didn't propagate yet (Entra can take 2–5 min) | Wait 5 min, retry once. If still blocked, ping me and I'll re-check the tenant ID against the consent record |
| "Reconnect required" message after Accept | Microsoft didn't return a refresh token (very rare — caused by an existing app authorization on your account) | Go to https://myapps.microsoft.com → Lovable CRM → Remove → retry Connect |
| Connected but no emails after 15 min | Backfill stuck on discovery | I can re-trigger `start-email-backfill` manually with `target_window: "90d"` |

