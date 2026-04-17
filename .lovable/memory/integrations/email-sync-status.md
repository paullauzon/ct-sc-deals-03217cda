---
name: Email Sync Status
description: Current state of Outlook/Gmail email sync — interim Zapier bridge for both, deep OAuth pending tenant/workspace admin approval
type: feature
---

## Current state (interim)

Both brands ingest email through the Zapier → `ingest-email` endpoint while waiting on admin approvals.

### Captarget (Gmail)
- **Active**: Zapier Gmail trigger → `ingest-email`
- **Blocked on**: captarget.com Google Workspace admin (Adam is NOT admin) to set up Google Cloud OAuth project in **Internal** mode
- Admin instructions delivered to user; awaiting credentials (Client ID + Secret)
- When live: build Gmail OAuth flow, drop Zapier Zap, dedup on `message_id` prevents collisions

### SourceCo (Outlook)
- **Active (interim)**: Zapier Outlook trigger (Inbox + Sent Items, two Zaps) → `ingest-email`
- **Blocked on**: sourcecodeals.com Microsoft tenant admin consent for Microsoft Graph scopes
- `sync-outlook-emails` edge function already built and ready to take over once consent lands
- When live: enable cron for `sync-outlook-emails`, disable Zapier Zaps; dedup on `message_id` / `provider_message_id`

## ingest-email contract (used by both brands)

POST `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/ingest-email`
Headers: `Authorization: Bearer ${INGEST_API_KEY}`, `Content-Type: application/json`

Body fields (all optional except `from`):
- `from` (required) — sender, "Name <email>" or plain email
- `to`, `cc`, `bcc` — string, comma/semicolon list, or array
- `subject`
- `body_preview` — short snippet (auto-derived from `body_text`/`body_html` if missing)
- `body_text` — plain text body
- `body_html` — HTML body
- `date` — ISO or any parseable date
- `message_id` — Internet Message-ID (used for dedup; auto-generated if absent)
- `thread_id` — generic thread identifier
- `conversation_id` — Outlook's conversation ID (mapped to `thread_id` if `thread_id` absent)
- `source` — defaults to `"zapier"`

Behavior:
- Dedup on `message_id` (returns `{status: "duplicate"}`)
- Direction: `outbound` if `from` is in INTERNAL_DOMAINS (captarget.com, sourcecodeals.com), else `inbound`
- Lead match: queries `leads.email IN (...)` against external (non-internal) participants; falls back to `lead_id = "unmatched"`

## Trade-offs of Zapier interim path

- 5-15 min polling latency (vs <1 min cron)
- No tracking pixels (opens/clicks); not possible without owning the send path
- No in-app send; compose drawer stays in "Copy & mark sent" mode
- Zapier task quota cost at sales volume (~$30/mo Pro plan)
- Zero switch-over cost when proper OAuth lands
