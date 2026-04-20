

# Should we keep Google "Testing" mode? + sync improvements

## Part 1 — Testing mode: keep or move to Production?

### What "Testing" mode actually costs you

The banner in your screenshot is real. Google's OAuth Testing mode imposes **three hard limits**:

| Limit | What it means in practice |
|---|---|
| **Refresh tokens expire every 7 days** | Every connected mailbox needs a manual "Reconnect" click weekly. Forever. |
| **Max 100 test users** | Fine for your team (4-5 people) but blocks anything customer-facing later. |
| **Permanent "unverified app" warning screen** | Each connect requires clicking "Advanced → Go to (unsafe)". Friction every time you add a mailbox. |

The 7-day expiry is the dangerous one. It means:
- Every Monday-ish, sync silently breaks for a mailbox until someone reconnects.
- You'll wake up to gaps in lead activity timelines.
- Cron will keep firing but produce zero results — easy to miss for days.

### What "Production" mode gives you

- **Refresh tokens never expire** (unless revoked, password changed, or 6 months unused)
- **Unverified app warning goes away** for the basic `userinfo.email` scope, and stays manageable for `gmail.readonly` + `gmail.send`
- **Unlimited users**

### What it costs to switch

Because we use **restricted scopes** (`gmail.readonly`, `gmail.send`), Google requires:
1. Verified domain ownership for your privacy policy + homepage URLs
2. A privacy policy page (must be reachable on captarget.com)
3. App homepage URL
4. **Security assessment by a CASA Tier 2 auditor** — costs $$$ and takes weeks, ONLY required if you have >100 users or want public listing
5. App logo (120×120 PNG)
6. Justification video (~2 min) showing the scopes in use

### Recommendation: hybrid path

Since this CRM is **internal-only** (you, Adam, Malik, Valeria, Myall), the cleanest move is:

**Option A — Switch consent screen User Type from "External" to "Internal"** *(if captarget.com is a Google Workspace domain)*
- Removes the 7-day expiry instantly
- No verification, no CASA, no audit
- Limits sign-in to your Workspace users only — which is exactly what you want
- This is the right answer if captarget.com is on Google Workspace

**Option B — Keep External but submit for Production verification**
- Required only if you mix Workspace and personal Gmail accounts
- 2-6 week review by Google, no CASA needed under 100 users
- Adds privacy policy + logo + video work

**Option C — Stay in Testing mode and build resilience around it** *(fallback)*
- Add a weekly cron that pings every active connection's token, surfaces "expires in 2 days" banners on the mailbox row
- Add a Slack/email alert when a mailbox enters Reconnect-required state
- Acceptable but adds permanent operational toil

I strongly recommend **Option A** if captarget.com is on Workspace. That's almost certainly the case given your setup.

## Part 2 — Sync verification (right now)

Backend evidence confirms the connection is healthy but **sync has not fired yet** against `id@captarget.com`:
- Cron `sync-gmail-emails-10min` last ran 12:50 UTC; connection created 12:52 UTC; current server time 12:59 UTC
- Next cron tick: 13:00 UTC (will run any second)
- 0 rows in `lead_emails` (expected — `id@captarget.com` has no lead conversations)
- No errors in any logs

The infrastructure is correct. We just haven't seen one full cycle yet for this mailbox.

## Part 3 — Sync improvements that matter

These are real gaps we should close before connecting Adam/Malik/Valeria's mailboxes for production use:

### 3.1 Backfill window — 7 days → 90 days *(high impact)*
First-run sync currently pulls only `newer_than:7d`. For Malik, that erases ~80% of his recent deal history. Change to `newer_than:90d` for first run, paginated, with the existing 250-message cap raised to 1500 for the initial pull only.

### 3.2 Domain-fallback matching *(high impact)*
Today: exact email match against `leads.email` only. So a reply from `cfo@acmeco.com` won't link to a lead whose primary contact is `ceo@acmeco.com`. Add a fallback: if no exact email match, match by sender domain against `leads.company_url` domain or `leads.email` domain. Internal domains stay excluded.

### 3.3 Hard cap removal for first run *(medium impact)*
`MAX_MESSAGES_PER_RUN = 250` is fine for incremental but truncates first-time backfill. Split into `MAX_FIRST_RUN = 1500` and `MAX_INCREMENTAL = 250`.

### 3.4 Auto-promote unmatched when a lead is later created *(medium impact)*
When ingest-lead creates a new lead, sweep `lead_emails` where `lead_id='unmatched'` and either the from/to address matches the new lead's email, or the participant domain matches the new lead's company domain — and reassign them. This makes the "unmatched bucket" self-healing.

### 3.5 Mailbox health badge in settings *(medium impact, UX)*
Show on each connection row: `last_synced_at` (relative time), inserted-in-last-24h count, and a red "Reconnect required" badge when `refresh_token` is null OR last sync errored OR `last_synced_at > 1 hour ago`.

### 3.6 Token expiry early-warning *(only needed if we stay in Testing mode)*
Add a daily cron that flags connections where the refresh token will expire within 48 hours and shows a yellow banner in settings. Skip this entirely if we move to Production / Internal mode.

### 3.7 Sync history log *(low impact, debugging)*
New tiny table `email_sync_runs` (connection_id, started_at, mode, fetched, inserted, matched, errors[]) so we can see "what happened on the 13:10 sync" without reading edge function logs.

### 3.8 Move CRM-sent skip from header-based to ID-based *(low impact, robustness)*
Current skip uses `X-CRM-Source` header + `<crm-` Message-ID prefix. Both are fragile against forwards/replies. Better: store outbound `provider_message_id` immediately on send, so dedupe just works.

## Files / changes

### Code changes (Part 3)
1. `supabase/functions/sync-gmail-emails/index.ts` — 90-day backfill, raised first-run cap, domain-fallback matching, sync-run logging
2. `supabase/functions/ingest-lead/index.ts` — sweep unmatched after lead creation
3. `src/components/MailboxSettings.tsx` — health badges, last-sync display, error states
4. New migration — `email_sync_runs` table + indexes
5. New migration — index on `lead_emails(lead_id)` for unmatched-claim sweeps (if missing)

### No code changes (Part 1)
Move to Internal user type or submit for Production verification — that's a Google Cloud Console action you take, not a code change.

## What I'd do in what order

1. **Decide Part 1 now** — pick A, B, or C. (My vote: A.)
2. **Implement 3.1, 3.2, 3.3, 3.5** in the next change — these are the high-impact ones for "everything syncs perfectly."
3. **Defer 3.4, 3.6, 3.7, 3.8** to a follow-up — useful but not blockers.
4. After that, connect Adam's mailbox and watch one full cycle.

