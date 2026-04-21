

# Switch Outlook OAuth from `/common` to tenant-specific endpoint

## Root cause
Josh correctly switched the Azure app to **single-tenant** (`AzureADMyOrg`). Our edge functions still hit Microsoft's `/common` multi-tenant endpoint, which Microsoft rejects for single-tenant apps created after Oct 2018 (error AADSTS50194).

## The fix (waiting on tenant ID)

Add a `MICROSOFT_TENANT_ID` secret containing SMC SourceCo's Directory (tenant) ID, then replace `/common` with `/${TENANT_ID}` in three places.

### Files to change

**1. `supabase/functions/outlook-oauth-start/index.ts`**
- Add `const TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID")` with missing-secret guard
- Change authorization URL base from `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` → `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`

**2. `supabase/functions/outlook-oauth-callback/index.ts`**
- Add `MICROSOFT_TENANT_ID` env read + guard
- Change token exchange endpoint from `https://login.microsoftonline.com/common/oauth2/v2.0/token` → `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`

**3. `supabase/functions/refresh-outlook-token/index.ts`**
- Same change: `/common/oauth2/v2.0/token` → `/${TENANT_ID}/oauth2/v2.0/token`
- Critical — without this, every token refresh will fail an hour after connect

### Secret to add
- `MICROSOFT_TENANT_ID` — Directory (tenant) ID UUID from Entra admin center (Overview tab)

## Steps once tenant ID arrives

1. **You**: Add `MICROSOFT_TENANT_ID` secret via the secret prompt I'll send
2. **Me**: Update the 3 edge functions to use the tenant-specific endpoint
3. **Me**: Re-verify edge function source compiles cleanly
4. **You**: Click **Connect Outlook** in incognito → expect clean consent prompt → "Connected {email}"
5. **Me**: Verify connection row in `user_email_connections`, register `sync-outlook-emails-10min` cron, watch first 90d backfill run, confirm routing audit passes

## Why no other approach works

- **Reverting to multi-tenant** would re-trigger the "approval required" wall and weaken security (any external Microsoft tenant could attempt sign-in).
- **Using `/organizations` endpoint** has the same restriction as `/common` for single-tenant apps.
- **Tenant-specific endpoint** is the correct, Microsoft-recommended pattern for single-tenant business apps and matches the security posture Josh intentionally chose.

## What to send Josh (if you don't already have tenant ID)

> One last thing — can you send me the **Directory (tenant) ID** from Entra admin center → Overview tab? It's a UUID. We need it because switching to single-tenant requires us to use a tenant-specific OAuth endpoint instead of the generic one. Quick fix on our side once I have it.

Once I have the tenant ID, the actual code change is ~30 seconds and Outlook connects on the next click.

