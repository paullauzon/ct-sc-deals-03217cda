

# Root cause: Google OAuth app is not configured to allow this user

The screenshot is Google's generic 403 page, which Google shows in **three completely different scenarios** that all look identical. The Google OAuth flow never reaches our `gmail-oauth-callback` function — it's blocked before the redirect.

## What's actually happening

Our code is fine. The OAuth start function builds a valid Google auth URL and redirects the browser. Google then refuses to show the consent screen and serves the 403 instead. This happens for one of three reasons:

### Cause 1 — App is in "Testing" mode and the user isn't on the test users list (most likely)

Google Cloud OAuth apps default to **Testing** publishing status. In Testing mode:
- Only emails explicitly added to the **Test Users** list can authorize the app
- All others get exactly this 403 page
- We're requesting **restricted scopes** (`gmail.readonly`, `gmail.modify`, `gmail.send`), which makes Testing mode even stricter — Google does not allow these scopes to be used with arbitrary users until the app is verified

### Cause 2 — Restricted Gmail scopes require Google verification before public use

`gmail.readonly` and `gmail.modify` are classified as **restricted scopes**. To move the app from Testing → Production, Google requires:
- A privacy policy URL
- A homepage URL
- App domain verification (proving you own the domain)
- Security assessment (CASA) for production-grade Gmail apps reading mail

Until this is done, the app stays in Testing and only test users can connect.

### Cause 3 — Wrong Google account is signed in / Google Workspace blocked the app

If the connecting user's Google Workspace admin (e.g. captarget.com or sourcecodeals.com) has restricted third-party app access, the same 403 appears. This is admin-controlled at the Workspace level.

## Why the 403 is so confusing

The page literally says *"you do not have access to this document"* — this is Google's generic permissions page that's reused across Drive, Docs, AND OAuth. There is no OAuth-specific error UI. Even Google's own engineers have complained about this.

## Recommended fix (priority order)

### Step 1 — Add test users (5 minutes, unblocks today)

In the Google Cloud Console for the OAuth client whose credentials are stored in `GOOGLE_OAUTH_CLIENT_ID`:

1. Go to **APIs & Services → OAuth consent screen**
2. Confirm **Publishing status: Testing**
3. Scroll to **Test users** → click **+ ADD USERS**
4. Add every email that needs to connect: `adam@captarget.com`, `malik@…`, etc. (up to 100 test users allowed)
5. Save

The user being added must be the **same Google account** they sign in with on the consent screen. Adding `adam@captarget.com` does not authorize `adam.haile@gmail.com`.

### Step 2 — Confirm the OAuth consent screen has the correct scopes registered

Same console screen, **Scopes** tab. Make sure all five scopes from `gmail-oauth-start/index.ts` are listed:
- `.../auth/gmail.readonly`
- `.../auth/gmail.send`
- `.../auth/gmail.modify`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

If a requested scope is missing here, Google also blocks consent (sometimes with this same 403).

### Step 3 — Confirm the redirect URI is exact

**APIs & Services → Credentials → OAuth 2.0 Client IDs → [our client]**, under **Authorized redirect URIs** there must be an exact match (no trailing slash, no path differences):

```
https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback
```

If this is wrong you usually get `redirect_uri_mismatch`, but it's worth confirming while you're in the console.

### Step 4 — Plan for production (later, when ready to roll out beyond the test users)

Two options:

**Option A — Stay in Testing forever.** Up to 100 test users. Refresh tokens expire after 7 days, forcing reconnection weekly. Fine for an internal team of 5–10 people IF we accept the weekly reconnect.

**Option B — Submit for Google verification.** Required for production use of `gmail.readonly` / `gmail.modify`. Process:
1. Add Privacy Policy + Terms URLs
2. Verify domain ownership in Google Search Console
3. Record a YouTube demo of OAuth flow
4. Submit for review (4–6 weeks for restricted scopes)
5. May require third-party CASA security assessment (~$15K)

For an internal CRM with <100 users, **Option A is the right choice**. Document the weekly reconnect in `MailboxSettings`.

## What I'll change in code (after Step 1 unblocks you)

Two small UX improvements once OAuth works:

1. **Better error surfacing in `gmail-oauth-callback`**: detect Google's `error=access_denied` query param and return a friendly HTML page that says "This Google account isn't on the test users list — ask Adam to add you in Google Cloud Console" instead of just `Authorization denied: access_denied`.

2. **Token-refresh failure handling in `MailboxSettings`**: when a refresh token expires (the 7-day Testing-mode limit), surface a clear "Reconnect required" badge per mailbox instead of silently failing the next sync.

## What this plan does NOT touch

- No DB migrations
- No new edge functions
- No changes to `sync-gmail-emails`, `send-gmail-email`, or `track-email-open`
- The code is correct — only the Google Cloud Console configuration needs to change

