

## Goal
Bring full Gmail + Outlook email correspondence into the platform, mirroring ~50% of HubSpot's email intelligence: full thread sync, tracking metadata, contact-level rollups, and timeline display.

## Current state (audit)
- `lead_emails` table exists, populated via `ingest-email` edge function (Zapier inbound)
- `EmailsSection.tsx` renders threaded view in Deal Room
- Memory: `email-correspondence-tracking` confirms Zapier-based inbound only
- **Limitation**: One-way (received only via Zapier triggers), no body content (only preview), no open/click tracking, no rollup metrics on lead

## Three integration paths — pros & cons

### Option A: Zapier (current, expand)
- Two-way via Zapier triggers ("New Email" + "New Sent Email" in Gmail/Outlook)
- Pros: Already wired, no OAuth complexity, works for all users
- Cons: Polling delay (1-15min), 100/mo free limit, no full body, no open/click events, fragile per-user setup

### Option B: Connector Gateway (Microsoft Outlook + custom Gmail OAuth) — RECOMMENDED
- Lovable already has `microsoft_outlook` connector (full Graph API access)
- Gmail requires per-user OAuth (Google Cloud Console app + token storage) since the connector is owner-scoped
- Pros: Real-time pull, full message bodies, attachments, threading native, no Zapier limits
- Cons: Requires per-user OAuth flow for Gmail; one-time setup per teammate (Malik/Valeria/Tomos)

### Option C: Hybrid (Recommended approach)
- **Outbound/Sent capture**: Microsoft Graph API + Gmail API polling every 5 min via cron
- **Inbound real-time**: Keep Zapier as fallback + add Gmail Push (Pub/Sub) and Outlook webhooks for instant
- **Full sync**: Backfill last 90 days on connection

## Recommended architecture

### Phase 1 — Foundation (this plan)
1. **Schema upgrade** to `lead_emails`:
   - `body_html` (full rich content), `body_text`, `attachments` (jsonb)
   - `opens` (jsonb array of timestamps), `clicks` (jsonb array of {url, timestamp})
   - `bounce_reason`, `replied_at`, `tracked` (bool), `logged` (bool)
   - `cc_addresses`, `bcc_addresses`
2. **New table `lead_email_metrics`** (rollup per lead — HubSpot parity):
   - `total_sent`, `total_received`, `total_opens`, `total_clicks`, `total_bounces`, `total_replies`
   - `last_sent_date`, `last_received_date`, `last_opened_date`, `last_clicked_date`, `last_replied_date`, `last_bounce_date`
   - `email_quarantined` (bool), `unsubscribed_all` (bool)
   - Auto-updated via DB trigger on `lead_emails` insert
3. **Sync engine selector UI** in Settings: each user picks Gmail or Outlook, completes OAuth, stores refresh token in `user_email_connections` table

### Phase 2 — Sync engines
4. **Microsoft Graph sync** (`sync-outlook-emails` edge function):
   - Use existing `microsoft_outlook` connector for Malik's account first
   - Pull `/me/messages?$filter=receivedDateTime gt {lastSync}&$top=100`
   - Match recipient/sender to leads by email
   - Cron every 5 min via `pg_cron`
5. **Gmail sync** (`sync-gmail-emails` edge function):
   - Per-user OAuth (Google Cloud Console app — user provides client_id/secret as secrets)
   - Use Gmail History API for incremental sync
   - Same matching + insert logic

### Phase 3 — Display upgrades (HubSpot parity for ~50% of features)
6. **Enhanced `EmailsSection.tsx`**:
   - Full HTML body in expandable view (sandboxed iframe)
   - Open/click count badges per email
   - Reply status indicator
   - Attachments with download links
   - Bounce reason inline if failed
7. **New `EmailMetricsCard`** on lead detail panel (top-right):
   - Last contact date, total sent/received, reply rate, open rate
   - Quarantine/unsubscribe warnings
8. **Timeline event integration**: Email events feed into existing activity log

## What we're explicitly NOT building (the other ~50% of HubSpot)
- Marketing email campaign management (you're not sending bulk)
- Open/click tracking pixel injection on outbound (requires custom send infrastructure — defer)
- Workflow enrollment tracking (no marketing automation)
- A/B subject line testing
- Subscription type management

## Decisions needed before build
Two questions to clarify scope.

## Technical notes
- Microsoft Outlook connector: workspace-scoped, uses gateway at `connector-gateway.lovable.dev/microsoft_outlook` — only Malik's account out of the box. For Valeria/Tomos, need per-user OAuth.
- Gmail: no Lovable connector exists; requires Google Cloud Console OAuth app
- Open/click tracking on outbound: would require us to send via our infrastructure (rewriting links, injecting pixels) — out of scope unless explicitly approved
- Realtime: existing Supabase realtime subscription on `lead_emails` already powers live UI updates

