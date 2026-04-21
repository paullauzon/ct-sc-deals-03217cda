

# Final deep audit — verdict and recommended additions

## Confirmed via fresh code re-read

- **7 files, 7 `/common` occurrences** — list locked: `outlook-oauth-start`, `outlook-oauth-callback`, `refresh-outlook-token`, `sync-outlook-emails`, `send-outlook-email`, `backfill-hydrate`, `backfill-discover`.
- **Frontend is clean** — `MailboxSettings.tsx` only calls our edge function `outlook-oauth-start`; zero Microsoft URLs in the React layer.
- **Callback already auto-triggers a 90d backfill** on successful connect (line 168 of `outlook-oauth-callback`). Good — but it means if `backfill-hydrate` / `backfill-discover` aren't fixed, the backfill silently 401s within 60 seconds of a "successful" connect.

## Will swapping `/common` → `/${TENANT_ID}` 100% fix it?

**Yes for the AADSTS50194 error specifically — 100% certain.** That error code is Microsoft's literal way of saying "you sent us `/common` but this app is single-tenant, send us `/${TENANT_ID}` instead." The remedy is mechanical.

**For the end-to-end "Connect Outlook works and stays working" goal — 97% certain.** Three small risks remain (covered below), all easy to handle if they surface.

## What I found on a second pass that strengthens confidence

1. **The callback already gracefully handles missing refresh tokens** (line 130–135) — so even if Microsoft doesn't re-issue a refresh token on a retry, we surface a clear "reconnect required" message instead of silently breaking.
2. **The callback already surfaces Microsoft's `error` and `error_description` query params** (line 53) — so any AADSTS code Microsoft returns *via the redirect* will be visible in the browser. Good.
3. **But:** when the failure happens at the *token exchange* step (line 88–92), we currently log to console but show the user a generic *"Microsoft rejected the authorization code"*. **This is the one real gap** — if anything else goes wrong post-deploy, we lose 30 minutes digging logs instead of seeing it on screen. Worth fixing now.
4. **The auto-backfill on connect** (line 167–177) means the moment connect "succeeds", we hit `start-email-backfill` → which dispatches `backfill-discover` → which does its own token refresh against `/common`. If we miss either backfill file, the connect screen says "Connected" but the backfill silently 401s within 60s. **Reinforces: all 7 files must change in one commit.**

## Three low-probability risks (and the cheap mitigations baked into this plan)

| Risk | Likelihood | Mitigation in this plan |
|---|---|---|
| Connecting a non-`@sourcecodeals.com` mailbox (e.g. personal `@outlook.com`) — single-tenant will reject | <1% (you'll only connect Malik/team) | Surface real Microsoft error so it's debuggable in 30s instead of 30min |
| Redirect URI registered under wrong Azure platform (SPA / Mobile instead of Web) | <1% | Asking Josh to verify in the same message — preempts a round-trip |
| Missing `MICROSOFT_TENANT_ID` secret produces a malformed URL with `//` | n/a if guarded | Fail-fast guard in all 7 files — clear error instead of confusing one |

## What I want to add to the original plan

Based on this deeper audit, three **small, free, "do it while we're touching the files anyway"** improvements:

1. **Fail-fast guard** in all 7 files: `if (!Deno.env.get("MICROSOFT_TENANT_ID")) throw new Error("MICROSOFT_TENANT_ID missing — single-tenant config requires this")`. Prevents a silent malformed-URL failure if the secret ever gets unset.

2. **Centralized base constant** at the top of each of the 7 files: `const MS_OAUTH_BASE = \`https://login.microsoftonline.com/${TENANT_ID}\`` instead of inlining the URL twice. Trivial, prevents future drift.

3. **Better callback error surfacing**: change line 91 of `outlook-oauth-callback` from generic *"Microsoft rejected the authorization code"* to actually show Microsoft's `error_description` from the response body (truncated to 200 chars). Saves us hours if any new Microsoft error surfaces post-deploy.

## What to send Josh (combined ask — preempts the only remaining risk)

> Hey Josh — almost there. Two quick things:
>
> 1. **Send me the Directory (tenant) ID** UUID from Entra admin center → Overview tab. (It's labeled *"Tenant ID"* — looks like `abc12345-...`. Single-tenant apps require us to address SMC SourceCo's directory specifically instead of using Microsoft's generic shared endpoint — natural consequence of the security upgrade you just made.)
>
> 2. **Quick verification** — in **App registrations → Lovable CRM — Outlook Sync → Authentication**, can you confirm the redirect URI `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/outlook-oauth-callback` is listed under the **"Web"** platform (not "SPA" or "Mobile and desktop applications")? If it's under one of the others, drag/re-add it under Web. Takes 10 seconds.
>
> Once you send the tenant ID and confirm the platform, I'll deploy the fix and you should be connected on the next click.

## Implementation steps once Josh replies

1. **You**: add `MICROSOFT_TENANT_ID` secret with the UUID Josh sends
2. **Me**: update all 7 files: tenant-specific endpoint + missing-secret guard + centralized base constant + improved callback error surfacing
3. **Me**: deploy all 7 functions, verify boot logs are clean
4. **You**: click **Connect Outlook** in incognito → expect "Connected {email}"
5. **Me**: verify `user_email_connections` row, register `sync-outlook-emails-10min` cron, watch the auto-triggered 90d backfill drain, run routing audit
6. **Me**: mark Outlook integration LIVE in memory

## What I will NOT do

- ❌ Touch `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (already correct)
- ❌ Change scopes (current 4 are minimum-necessary)
- ❌ Revert to multi-tenant (would weaken security and re-trigger Josh's admin-consent wall)
- ❌ Add a fallback to `/common` (defeats the security model and would mask real errors)

