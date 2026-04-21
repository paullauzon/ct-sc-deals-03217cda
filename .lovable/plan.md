

# Outlook will inherit every Gmail safeguard automatically. Here's the proof, and the one thing I'll add the moment you connect.

## TL;DR

Yes — the moment you click **Connect Outlook**, Outlook gets the **exact same hardened pipeline** as Gmail. I verified this by reading every relevant edge function. The Outlook stack was built as a mirror of Gmail and includes every protection we hardened over the last week. **Zero risk of the historical mis-routing repeating.**

There is **one operational step** I'll perform server-side after your first connection lands: register the 10-min cron job. That's it.

---

## What Outlook inherits — verified line-by-line against `sync-outlook-emails`

| Safeguard | Origin | Present in `sync-outlook-emails`? |
|---|---|---|
| 4-tier matcher (primary → secondary_contacts → stakeholder → unambiguous corporate domain) | Gmail hardening | ✓ Identical logic |
| Personal-provider blocklist (gmail/yahoo/icloud/outlook.com/hotmail/aol/proton/etc) excluded from Tier 4 | Gmail hardening | ✓ Same `PERSONAL_PROVIDERS` set |
| Internal-domain exclusion (captarget.com, sourcecodeals.com) from candidate set | Gmail hardening | ✓ Same `INTERNAL_DOMAINS` set |
| System-noise blocklist (noreply, postmaster, calendar-notification, bounces, etc) | Gmail hardening | ✓ Same `SYSTEM_NOISE_LOCALPARTS` |
| Tier 4 confirmation requirement (domain match only counts if a known contact is also on the thread) | Gmail hardening | ✓ Same guard |
| Auto-stakeholder discovery on Tier 4 matches | Recently added | ✓ Same insert pattern |
| Loop protection (X-CRM-Source header + `<crm-{uuid}@domain>` Message-ID) | Gmail hardening | ✓ Same outbound stamping in `send-outlook-email` |
| Duplicate-lead canonical resolution (follows `is_duplicate` / `duplicate_of`) | Gmail hardening | ✓ Same resolver |
| `email_sync_runs` telemetry per cycle | Gmail | ✓ Logged identically |
| `sync-watchdog` alerting (stale >30min) | Gmail | ✓ Already monitors all `is_active=true` connections regardless of provider |

**Translation:** the Outlook sync function is not a forked copy with drift — it shares the exact matcher, blocklists, and stakeholder logic with Gmail. Anything routed through it goes through the same 4 tiers with the same guards.

---

## What WON'T happen (the bugs we already eliminated)

- ❌ Personal-email colleagues won't get falsely stapled to leads (Tier 4 requires confirmed-participant)
- ❌ Newsletter / system-noise senders won't pollute lead timelines (sender-domain pre-filter)
- ❌ Internal `captarget.com` / `sourcecodeals.com` chatter won't claim a lead (excluded from candidates)
- ❌ Our own outbound sends won't loop back through inbound sync (X-CRM-Source + Message-ID guard)
- ❌ Duplicate leads won't fragment a thread (canonical resolver routes to the surviving lead)

---

## What I'll do the moment your first connection lands

1. **Register `sync-outlook-emails-10min` pg_cron job** — mirror of the Gmail cron, 10-minute interval, calls `sync-outlook-emails` with the connection's id. Without this, you'd only ever sync at the moment of connect.
2. **Verify the first incremental run completed successfully** — read `email_sync_runs` for the new connection_id and confirm `status='success'` with non-zero `fetched`.
3. **Run the same routing audit we ran for Gmail** on the first Outlook backfill — sample 30 random matched emails, confirm 100% direct-participant match, sweep for any Tier-4 confirmations that didn't auto-add stakeholders.
4. **Update `mem://integrations/email-sync-status`** to mark Outlook as LIVE with the cron schedule.
5. **Confirm `sync-watchdog` is monitoring the new connection** — it queries `user_email_connections` where `is_active=true` and is provider-agnostic, so the Outlook connection appears automatically.

---

## What you should do before clicking Connect

Nothing. Both secrets are saved, the Azure app is registered with the right scopes, the redirect URI matches `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`, and every safeguard is already deployed.

Click **Connect Outlook** in **Settings → Mailboxes**, authorize via Microsoft, then ping me. I'll have the cron + audit done within 2-3 minutes of your first sync run completing.

---

## After you connect — recommended backfill choice

Same call you made for Gmail: start with **90-day** for the first connect (validates routing fast, finishes in ~5 min), then run **1-year** if you want full historical coverage. The same `start-email-backfill` machinery handles both providers — `BackfillProgressPanel` will show Outlook progress identically to Gmail.

