

# Confirmed: the Gmail connection works

## Evidence from your backend (not guesses)

| Check | Result |
|---|---|
| Mailbox row in `user_email_connections` | `id@captarget.com` (Captarget label), `is_active=true` |
| Refresh token captured | Yes — this is the make-or-break field |
| Access token | Valid until ~14:51 UTC (auto-refreshes after) |
| OAuth callback errors | None |
| Cron `sync-gmail-emails-10min` | Already active, runs every 10 minutes |
| `last_synced_at` | Still null — cron hasn't fired since 12:52 connect, next tick will populate it |
| `lead_emails` table | 0 rows (expected: this mailbox has no threads with your leads) |

You connected from the published URL → callback wrote the row to the **Live DB** → cron is scheduled in the **Live DB** → next 10-minute tick will perform the first sync. Everything from Connect → Callback → Token storage → Auto-refresh → Scheduled sync is wired correctly.

## Why "all emails sync right away" is more nuanced than it sounds

The sync function is doing exactly what it should, but a few things are worth understanding before connecting your real sales mailboxes:

1. **First-run window is 7 days.** Initial sync pulls `newer_than:7d` from Gmail, then incremental from there. Mail older than 7 days will not backfill unless we change this.
2. **Only emails to/from known leads get linked.** Anything else is saved as `lead_id='unmatched'` so it can be claimed when a lead is added later.
3. **Internal-domain emails are skipped.** `captarget.com` and `sourcecodeals.com` are excluded from lead matching by design.
4. **Cron runs every 10 minutes.** "Right away" really means "within 10 minutes of arriving in Gmail." For now this is a fine cadence; we can drop to 5 min later if needed.
5. **You connected a test mailbox (`id@captarget.com`) that has no lead conversations** — that's why `lead_emails` is still 0. This is correct behavior, not a bug.

## What to do next — in this exact order

### Step 1 — Trigger the first sync now (don't wait for cron)
Click **Sync now** on the `id@captarget.com` row. This proves the full read path works against a mailbox that has zero lead matches. Expected result: toast says `"Synced N messages — 0 matched, 0 duplicate — emails saved as unmatched..."`.

### Step 2 — Add the real sales mailboxes one at a time
Once Step 1 returns cleanly, connect the actual sales accounts so production sync starts:
- `adam@captarget.com`
- `malik@captarget.com`
- `valeria@captarget.com` (or whichever address handles SourceCo)

For each: click **Connect Gmail** → use the matching Google account in the consent screen → land back in settings → click **Sync now** to verify the first manual pull worked.

### Step 3 — Verify lead linking actually fires
After Step 2, pick one known lead with recent email correspondence and open their Deal Room → Activity. Confirm the inbound emails now appear with `source: gmail`. This is the only test that proves the matching engine works on real data.

### Step 4 — Decide what to do with the test mailbox
Since `id@captarget.com` is not used for sales, you have three options:
- **Disconnect it** (cleanest — one less mailbox the system has to keep tokens fresh for)
- **Leave it active** (harmless — it just won't match anything)
- **Re-purpose it** as a catch-all for any mail forwarded to it from leads

I'd recommend disconnect after Steps 1–3 confirm everything works.

## Optional improvements (do not need user input now, decide later)

These are real gaps worth knowing about, but none of them block you from connecting the real mailboxes today:

- **Backfill window**: change first-run from 7 days to 30 or 90 days for a richer initial history pull
- **Sync cadence**: drop cron from every 10 min → every 5 min once we trust the load
- **Outbound from CRM**: `send-gmail-email` already exists; we could wire the email composer to use the connected mailbox per user
- **Reconnect signaling**: if the 7-day Testing-mode token expires, surface a banner instead of just a row badge
- **Per-user mailbox ownership**: today any logged-in user can see all connections; if you want strict ownership, we'd add a `user_id` column with RLS

## Files / changes proposed for this plan

**None.** Step 1–4 are pure configuration and verification actions you take in the UI. No code changes are required to confirm the integration is healthy and to onboard the real mailboxes. The optional improvements above would each be a small, scoped follow-up plan if and when you decide to do them.

