

# Connect Outlook now → I activate the cron + audit immediately after

## What Josh just did
Tenant admin consent is granted for `sourcecodeals.com`. The "approval required" wall is gone. Any user on your tenant can now complete the OAuth flow without admin intervention.

## What you do now (30 seconds)

1. Go to **Settings → Mailboxes** (you're already on `/#view=settings&sys=crm`)
2. Click **Connect mailbox** → **Outlook**
3. Sign in with your `sourcecodeals.com` Microsoft account
4. Approve the consent screen (this time it'll be a clean consent prompt, not the admin wall)
5. You'll be redirected back to the CRM with "Connected {your-email}"

The 90-day backfill auto-fires the moment the connection lands (already wired in `outlook-oauth-callback`).

## What I do the moment your connection lands

1. **Verify the connection row** in `user_email_connections` (provider=outlook, is_active=true)
2. **Register the `sync-outlook-emails-10min` pg_cron job** — mirror of the Gmail cron, fires every 10 min, calls `sync-outlook-emails` for all active Outlook connections
3. **Watch the first backfill run** via `email_sync_runs` and `BackfillProgressPanel` — confirm `status='success'` with non-zero `fetched`
4. **Run the routing accuracy audit** — sample 30 random matched emails from the backfill, confirm 100% direct-participant match (Tiers 1-3) and that any Tier-4 confirmations correctly auto-added stakeholders
5. **Confirm `sync-watchdog` picked it up** — it's already provider-agnostic, so it should auto-monitor the new connection
6. **Update `mem://integrations/email-sync-status`** to mark Outlook LIVE with cron schedule

## If anything fails on connect

The two most likely failure modes (both have clear remediation):

- **"Reconnect required — no refresh token"** → Microsoft sometimes withholds the refresh_token on a re-auth if the app already has prior consent for your account. Fix: go to https://account.live.com/consent/Manage, remove the app, retry connect.
- **Token exchange failed** → Indicates a secret mismatch between Azure and our backend. I'd verify `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` against Azure and re-add if needed.

Neither is likely — both secrets are saved and the Azure config matches our redirect URI.

## After audit passes

You're done. Outbound sends from the Outlook account will route through `send-outlook-email` (loop-protected with the same X-CRM-Source + Message-ID stamping as Gmail). Inbound stays in sync every 10 min. Malik or any other rep can connect their own Outlook the same way — no admin re-approval needed.

**Ping me with "connected" once the OAuth round-trip completes** and I'll kick off steps 1-6 immediately.

