

## Pause Outlook integration — keep Zapier running

You're blocked on tenant admin approval. Here's the holding pattern.

## What stays as-is (already working)
- **Zapier inbound** via `ingest-email` edge function — keeps capturing inbound Gmail/Outlook emails into `lead_emails`
- **Database foundation** — `lead_emails` schema upgrades, `lead_email_metrics` rollup table, `user_email_connections` table all stay in place (no rollback)
- **UI components** — `EmailMetricsCard` and upgraded `EmailsSection` stay live; they read from existing data and gracefully show empty/partial states
- **`sync-outlook-emails` edge function** — stays deployed but dormant (no cron scheduled, no automatic runs)

## What I'll do now
1. **Add a memory note** at `mem://integrations/email-sync-status` recording: Outlook sync built but blocked on SMC SourceCo tenant admin consent; Adam Haile is not admin; resume when approval lands.
2. **Update** `mem://features/email-correspondence-tracking` to reflect current dual state: Zapier active for inbound, deep sync paused.
3. **No code changes, no migrations, no edge function deploys.**

## When you're ready to resume
Ping me with one of:
- "Admin approved Outlook" → I retry the connection and turn on the 5-min cron
- "Switching to Gmail" → I build the Gmail OAuth flow + `sync-gmail-emails` function
- "Build per-user OAuth" → I build the multi-rep connection UI + token management

Until then, Zapier handles inbound and nothing breaks.

