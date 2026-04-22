

# Phase 11 — Activate Outlook deep sync with Josh's tenant ID

Josh handed over the **Microsoft directory (tenant) ID** for SMC SourceCo, LLC. That's the exact unlock the OAuth flow has been waiting on. The deep-sync code, send code, token refresh, UI provider routing, and dedup logic are all already built and deployed — they've just been pointed at Microsoft's multi-tenant `/common/` endpoint, which requires a global admin consent step Adam can't perform. Switching to the single-tenant endpoint scoped to Josh's tenant bypasses the global-admin requirement and lets any user in that tenant grant the app personal mailbox access.

This phase flips that switch, stores the tenant ID as a secret, runs the connect flow, validates an end-to-end sync, and turns on the cron.

## What we're changing

### 1. Store the tenant ID as a secret
Add `MICROSOFT_TENANT_ID` to project secrets (value provided by Josh, format like `8a4b...-...-...-...-...`). All three Outlook edge functions read from env so no code in the function body needs the raw ID.

### 2. Repoint the OAuth endpoints from `/common/` to the tenant
Three small edits — one URL each — in:
- `supabase/functions/outlook-oauth-start/index.ts` → `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize`
- `supabase/functions/outlook-oauth-callback/index.ts` → `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
- `supabase/functions/refresh-outlook-token/index.ts` → same `/token` endpoint

Each function already pulls `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` from env; we add a `MICROSOFT_TENANT_ID` read with a graceful fallback to `common` so if the secret is missing for any reason we don't break in a confusing way.

### 3. Confirm Azure App Registration redirect URI matches
The redirect URI in Josh's Azure App Registration must be exactly:
`https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`
Already documented in our memory file, but worth a manual confirmation before the first connect attempt — a single character mismatch returns a friendly Microsoft error immediately, no data risk.

### 4. Deploy + connect Adam's mailbox
Deploy the three updated functions. Then in **Settings → Mailboxes → Connect mailbox → Connect Outlook**, Adam labels the mailbox (e.g. "Adam SourceCo") and is sent through Microsoft's tenant-scoped consent screen. Because it's now scoped to SMC SourceCo's tenant, only individual-user consent is needed (not global admin). On approval the existing callback exchanges the code, fetches `/me`, persists tokens, and **automatically dispatches a 90-day backfill** (already wired in `outlook-oauth-callback` lines that hit `start-email-backfill`).

### 5. Validate end-to-end on real data
After the backfill finishes (visible live in `BackfillProgressPanel` already mounted in `MailboxSettings`):
- Confirm `lead_emails` rows landed with `source = 'outlook'`
- Spot-check three matched leads to confirm threading, `replied_at` stamping, and stakeholder auto-discovery look right
- Trigger a manual **Sync now** to confirm the incremental pull works
- Send one test email from the composer to confirm `send-outlook-email` delivers, the loop-protection header lands, and the resulting message does NOT get re-ingested on the next sync
- Confirm the EmailMetricsCard / Email tab KPIs populate for an Outlook lead

### 6. Schedule the 5-minute cron
Once the manual loop is clean, schedule `sync-outlook-emails` to run every 5 minutes via pg_cron, mirroring the Gmail cadence. Includes a watchdog log entry on each run for visibility in the existing automation health panel.

### 7. Update the memory note
Flip `mem://integrations/email-sync-status` to reflect: *Outlook deep sync LIVE in tenant `[id]`. Cron active every 5 min.* Remove the "blocked on tenant admin consent" line.

## Out of scope for this phase

- **Multi-tenant support for other Outlook customers** — we're explicitly single-tenanting to SMC SourceCo. If another tenant ever needs to connect, we either add a second app registration or move back to `/common/` after global-admin consent. Not relevant today.
- **Sent-items folder permissions edge cases** — Microsoft surfaces the user's own sent folder under the same `Mail.Read` scope we already request; no new scope needed.
- **Outlook calendar / Teams** — separate scopes, separate problem, not part of email sync.

## Risks and how we handle them

- **Tenant ID typo** → connect fails immediately with `AADSTS50020` or `AADSTS90002`. Caught on first connect attempt before any DB writes. No cleanup needed.
- **Redirect URI mismatch in Azure** → Microsoft returns `AADSTS50011` on the consent screen. Caught before token exchange. No cleanup needed.
- **A user outside Josh's tenant tries to connect** → Microsoft refuses with `AADSTS50020`. Expected behavior — this is exactly what single-tenant scoping is supposed to do.
- **First backfill is slow** → already handled by `BackfillProgressPanel`'s live progress; user sees real-time counts and can keep working.<lov-plan>

# Phase 11 — Activate Outlook deep sync with Josh's tenant ID

Josh handed over the **Microsoft directory (tenant) ID** for SMC SourceCo, LLC. That's the exact unlock the OAuth flow has been waiting on. The deep-sync code, send code, token refresh, UI provider routing, and dedup logic are all already built and deployed — they've just been pointed at Microsoft's multi-tenant `/common/` endpoint, which requires a global admin consent step Adam can't perform. Switching to the single-tenant endpoint scoped to Josh's tenant bypasses the global-admin requirement and lets users in that tenant grant the app personal mailbox access.

This phase flips that switch, stores the tenant ID as a secret, runs the connect flow, validates an end-to-end sync, and turns on the cron.

## What we're changing

### 1. Store the tenant ID as a secret
Add `MICROSOFT_TENANT_ID` to project secrets (the GUID Josh sent, format like `8a4b...-...-...-...-...`). All three Outlook edge functions read from env so the raw ID never lives in code.

### 2. Repoint the OAuth endpoints from `/common/` to the tenant
Three small edits — one URL each — in:
- `outlook-oauth-start/index.ts` → `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize`
- `outlook-oauth-callback/index.ts` → `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
- `refresh-outlook-token/index.ts` → same `/token` endpoint

Each function pulls `MICROSOFT_TENANT_ID` from env with a graceful fallback to `common` so a missing secret fails loudly instead of silently.

### 3. Confirm the Azure App Registration redirect URI
Must be exactly `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback`. Worth a one-second visual check in Josh's Azure portal before the first connect — a mismatch returns a friendly Microsoft error, no data risk.

### 4. Deploy + connect Adam's mailbox
Deploy the three updated functions. Then in **Settings → Mailboxes → Connect mailbox → Connect Outlook**, Adam labels the mailbox (e.g. "Adam SourceCo") and is sent through Microsoft's tenant-scoped consent screen. Because it's now scoped to SMC SourceCo's tenant, only individual-user consent is needed (no global admin). On approval the existing callback exchanges the code, fetches `/me`, persists tokens, and **automatically dispatches a 90-day backfill** (already wired in the callback).

### 5. Validate end-to-end on real data
After the backfill finishes (visible live in `BackfillProgressPanel`):
- Confirm `lead_emails` rows landed with `source = 'outlook'`
- Spot-check three matched leads for threading, `replied_at` stamping, and stakeholder auto-discovery
- Trigger a manual **Sync now** to confirm the incremental pull works
- Send one test from the composer to confirm `send-outlook-email` delivers, the loop-protection header lands, and the message does NOT get re-ingested on the next sync
- Confirm `EmailMetricsCard` and the Email tab KPIs populate for an Outlook lead

### 6. Schedule the 5-minute cron
Once the manual loop is clean, schedule `sync-outlook-emails` every 5 minutes via pg_cron, mirroring the Gmail cadence, with a watchdog log entry on each run for the automation health panel.

### 7. Update the memory note
Flip `mem://integrations/email-sync-status` to reflect: *Outlook deep sync LIVE in tenant `[id]`. Cron active every 5 min.* Remove the "blocked on tenant admin consent" line.

## Out of scope

- **Multi-tenant support for other Outlook customers** — single-tenanted to SMC SourceCo intentionally. Another tenant ever needs to connect → second app registration or fall back to `/common/`.
- **Outlook calendar / Teams** — separate scopes, separate problem.

## Risks and handling

- **Tenant ID typo** → connect fails immediately with `AADSTS50020/90002`. Caught on first attempt, no DB writes.
- **Redirect URI mismatch** → Microsoft returns `AADSTS50011` on consent screen. Caught before token exchange.
- **User outside Josh's tenant tries to connect** → Microsoft refuses with `AADSTS50020`. Expected behavior — exactly what single-tenant scoping is supposed to do.
- **First backfill is slow** → already handled by `BackfillProgressPanel`'s live progress; Adam sees real-time counts.

