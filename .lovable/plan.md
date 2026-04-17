
The user is now approving the deep email integration work. Critical context I need to gather:

1. What email infrastructure already exists — `lead_emails` table, `lead_email_metrics`, `EmailMetricsCard`, `useUnansweredEmails`, `EmailsSection`, `ingest-email` (Zapier), `sync-outlook-emails` (paused — admin consent), and the new `suggest-email-responses` v6 function.

2. From memory `mem://integrations/email-sync-status`: Outlook deep sync is built but paused pending tenant admin consent. The screenshot shows the user just got Microsoft admin consent approved ("Lovable access request Approved"). So Outlook is now unblocked.

3. From `mem://features/email-correspondence-tracking`: dual-state — Zapier active for inbound, deep sync pending.

4. The user wants HubSpot-style email intelligence at "roughly half" depth. Looking at the HS list:

**Marketing email properties — NOT applicable** (we don't send marketing emails; this is a sales CRM for retainer-paying clients). Skip entirely.

**Sales/one-to-one email properties — YES, this is the core**:
- Recent open / click / replied dates per contact (we have `lead_email_metrics` with last_opened/clicked/replied — partially done)
- Email opened tracking via tracking pixel (NOT BUILT)
- Click tracking via link rewriting (NOT BUILT)

**Per-email timeline detail — partially built but missing**:
- Subject ✓ (have it)
- Body ✓ (have body_html, body_text, body_preview)
- Open count + timestamps (have `opens` jsonb, never populated)
- Click count + timestamps (have `clicks` jsonb, never populated)
- From / To / CC / BCC ✓
- Tracked badge (need to add `tracking_enabled` field on outbound)
- Reply status ✓ (`replied_at`)
- Bounce details ✓ (`bounce_reason`)
- Attachments — partially (have `attachments` jsonb, only marks "has", doesn't list/download)

**The actual gap analysis:**

A. **Inbound email pipeline** — Zapier works for Gmail+Outlook into `lead_emails` ✓ shipped
B. **Outbound deep sync from workspace mailbox** — `sync-outlook-emails` written but paused (admin consent now granted per screenshot)
C. **Gmail equivalent of (B)** — not built at all
D. **Tracking pixels for opens** — not built
E. **Link rewriting for clicks** — not built
F. **Reply detection** — partially auto via `lead_email_metrics`, but needs threading
G. **Attachments** — list-only, not downloadable
H. **Timeline UI per email** — exists in EmailsSection but missing the rich event chips (opens, clicks, bounces with timestamps)
I. **Compose/send from app** — `EmailComposeDrawer` exists, but does it actually send through workspace mailbox? Need to check.
J. **Cron sync** — Outlook function exists, needs scheduled trigger

Let me think about what to actually implement now. The user said "roughly half" of HubSpot. The right cut for an M&A retainer-CRM is:

**Tier 1 (must ship now)** — Two-way sync with workspace mailboxes
1. Activate Outlook deep sync (admin consent granted) — schedule cron
2. Add Gmail deep sync as parallel function (same pattern via Gmail connector)
3. Open tracking via 1×1 transparent pixel injected when sending from app
4. Click tracking via link rewriting through a tracking redirector
5. Send-from-app actually delivering through the user's Outlook/Gmail (so sent items show up in their Sent folder + the recipient sees the user's address)
6. Per-email open/click event chips in timeline (we have schema, need UI)

**Tier 2 (stretch, defer to next round)** — 
- Attachment download
- Send-later / scheduled send  
- Email templates with variable insertion
- Bounce detection beyond what providers report (Gmail/Outlook surface bounces in inbox, parse them)

**Tier 3 (probably skip)** —
- Marketing email features (we don't do this)
- Spam report (rare for 1:1 sales)
- Subscription type management

Let me also think about architecture cleanly:

- The "two-way sync" pattern: outbound emails sent from app → POST to provider's send API → webhook/polling brings the threaded reply back via the existing inbound pipeline
- For tracking: when we send from app, we (1) inject pixel pointing to our edge function, (2) rewrite each <a href> to wrap in our redirector edge function. Both functions log to `lead_emails.opens` / `.clicks` jsonb
- For threading: use `In-Reply-To` and `References` headers on send so replies come back in same thread_id

Let me check what currently exists in EmailComposeDrawer and EmailsSection to understand exactly what's there.

I should check briefly:
1. `EmailComposeDrawer.tsx` — does it actually send anywhere?
2. `EmailsSection.tsx` — what timeline events does it render?
3. Migrations for `lead_emails` schema to confirm fields

Let me do a quick read of these to make my plan accurate.
