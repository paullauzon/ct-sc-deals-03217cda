

# Phase 11 — Activate Outlook deep sync

You'll add the `MICROSOFT_TENANT_ID` secret (Directory ID Josh sent), and I'll execute the rest end-to-end.

## What I'll do once you approve

### 1. Repoint OAuth to the tenant-scoped endpoint
Three one-line edits, swapping `/common/` → `/${TENANT_ID}/` (with graceful fallback to `common` if the secret is somehow missing):
- `supabase/functions/outlook-oauth-start/index.ts` — authorize URL
- `supabase/functions/outlook-oauth-callback/index.ts` — token URL
- `supabase/functions/refresh-outlook-token/index.ts` — token URL

### 2. Deploy the three updated functions
Via `supabase--deploy_edge_functions` so changes go live immediately.

### 3. Hand the connect step back to you
You'll go to **Settings → Mailboxes → Connect mailbox → Connect Outlook**, label it (e.g. "Adam SourceCo"), and approve consent on Microsoft's tenant-scoped screen. The existing callback exchanges the code, fetches `/me`, persists tokens, and **auto-dispatches a 90-day backfill** (already wired).

### 4. Validate end-to-end on real data
After backfill completes (live progress in `BackfillProgressPanel`):
- Query `lead_emails` for `source = 'outlook'` rows landing
- Spot-check 3 matched leads — threading, `replied_at` stamping, stakeholder discovery
- Trigger manual **Sync now** to confirm incremental pull works
- Send one test email from composer → confirm delivery + loop-protection header + no re-ingestion on next sync
- Confirm `EmailMetricsCard` and Email tab KPIs populate for an Outlook lead

### 5. Schedule the 5-minute cron
Insert a `pg_cron` job for `sync-outlook-emails` every 5 minutes, mirroring Gmail's cadence, with `cron_run_log` entry per run for the existing automation health panel.

### 6. Update memory
Flip `mem://integrations/email-sync-status` to: *Outlook deep sync LIVE in tenant `[id]`, cron active every 5 min.*

## What you need to do right now

Add the secret:
- **Name:** `MICROSOFT_TENANT_ID`
- **Value:** the Directory ID GUID Josh sent (format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

Once it's saved, say "go" and I'll execute steps 1–6 in one pass.

## Risks already mitigated

- **Tenant ID typo** → Microsoft returns `AADSTS90002` immediately, no DB writes.
- **Redirect URI mismatch** → already verified from Josh's screenshot, matches `outlook-oauth-callback` exactly.
- **Non-tenant user tries to connect** → Microsoft refuses with `AADSTS50020`. Expected.
- **Secret missing at runtime** → fallback to `/common/` keeps the old (non-working but non-crashing) behavior; you'd see the same admin-consent screen as before, no silent corruption.

