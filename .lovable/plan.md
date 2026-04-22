

# Outlook end-to-end audit — 4 hidden bugs + connect step still pending

## Verdict

The Phase 11 OAuth fix is **only 3/7 functions deep**. I found 4 more functions that still hardcode `/common/` and will silently break the moment Outlook tokens need to refresh or send. Plus Adam hasn't connected his mailbox yet, so zero Outlook data has flowed.

## What I verified

| Check | Result |
|---|---|
| `MICROSOFT_TENANT_ID` secret | ✅ Set |
| OAuth start uses tenant URL | ✅ Fixed |
| OAuth callback uses tenant URL | ✅ Fixed |
| `refresh-outlook-token` uses tenant URL | ✅ Fixed |
| `sync-outlook-emails` token refresh | ❌ Still `/common/` (line 79) |
| `send-outlook-email` token refresh | ❌ Still `/common/` (line 46) |
| `backfill-discover` Outlook token refresh | ❌ Still `/common/` (line 72) |
| `backfill-hydrate` Outlook token refresh | ❌ Still `/common/` (line 123) |
| `sync-outlook-emails-5min` cron scheduled | ✅ Active, every 5 min |
| Outlook connections in DB | ❌ **Zero** — only 2 Gmail connections exist |
| Outlook backfill jobs run | ❌ **Zero** — only Gmail backfills |
| `lead_emails` with `source = 'outlook'` | ❌ **Zero** rows |

## Why the 4 hidden `/common/` URLs matter

Each Outlook function has its own inline `getValidOutlookToken()` helper that hits Microsoft's token endpoint directly instead of importing from `refresh-outlook-token`. When Phase 11 patched the shared helper, these 4 inline copies were missed. Symptoms once Adam connects:

- **First sync:** May appear to work because the access token issued at OAuth time is still valid (~1 hour).
- **Second sync (after token expires):** All four functions try to refresh against `/common/` — Microsoft returns `AADSTS65001` ("user has not consented to this app") because consent was granted under the tenant-scoped endpoint, not `/common/`. Sync stops, sends fail, backfill stalls.
- **No DB corruption** — fails loudly with HTTP errors logged to `cron_run_log`.

## What I'll fix

### Edit 1 — `supabase/functions/sync-outlook-emails/index.ts` line 79
Add `const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID") || "common";` and swap `/common/` → `/${TENANT_ID}/`.

### Edit 2 — `supabase/functions/send-outlook-email/index.ts` line 46
Same swap.

### Edit 3 — `supabase/functions/backfill-discover/index.ts` line 72
Same swap.

### Edit 4 — `supabase/functions/backfill-hydrate/index.ts` line 123
Same swap.

### Deploy all 4
Single `supabase--deploy_edge_functions` call.

## What you do after the fix

The tenant scoping and cron are live, but **Adam still has to connect his mailbox**. Until he does, there's nothing for the cron to sync. Steps:

1. Settings → Mailboxes → **Connect Outlook**
2. Label it (e.g. "Adam SourceCo")
3. Approve consent on Microsoft's tenant-scoped screen — should be one-click per-user, no global admin block
4. 90-day backfill auto-starts; watch `BackfillProgressPanel`

## Validation I'll run after Adam connects

- Confirm a row appears in `user_email_connections` with `provider = 'outlook'`
- Confirm an `email_backfill_jobs` row enters `discovering` → `hydrating` → `done`
- Confirm `lead_emails` rows land with `source = 'outlook'`
- Spot-check 3 matched leads for threading + `replied_at` stamping
- Confirm next 5-min cron tick logs to `cron_run_log` with `job_name = 'sync-outlook-emails'`
- Confirm token refresh works (force a refresh by waiting >1hr OR by setting `token_expires_at` to past and triggering sync)

## Out of scope

- Email-sync-status memory file already says "live" — accurate after Adam connects, no edit needed now
- `/common/` fallback in code is intentional — keeps Gmail-only deployments safe if `MICROSOFT_TENANT_ID` is ever cleared

