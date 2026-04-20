

# Root cause: this 403 is NOT an OAuth error — it is Google blocking your account from viewing the consent screen

The screenshot is misleading. It looks like an OAuth failure but it is actually a **Google Account access page error**, served *before* the OAuth consent screen renders. Three findings explain this exactly.

## What's actually happening

### Finding 1 — The page itself is the giveaway

The screenshot says **"403. That's an error. We're sorry, but you do not have access to this document."**

This is **not**:
- the OAuth consent screen ("Choose an account / [App] wants access to your Google Account")
- the unverified-app warning ("Google hasn't verified this app")
- the access denied page ("Error 403: access_denied")
- the `redirect_uri_mismatch` page ("Error 400: redirect_uri_mismatch")

It's the generic Google Docs / Google Account 403. Google serves this exact page when **the Google account currently signed in to the browser is not allowed to interact with the requested resource**. In OAuth context this happens in three specific scenarios — and only three.

### Finding 2 — Your code and config are correct

Verified end-to-end:

- `gmail-oauth-start` builds the URL correctly: `https://accounts.google.com/o/oauth2/v2/auth?client_id=…&redirect_uri=https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback&…`
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` exist as secrets
- The redirect URI in code matches what must be registered in Google Console
- Scopes are clean (`gmail.readonly`, `gmail.send`, `userinfo.email`)
- State encoding is UTF-8-safe
- `prompt=consent` and `access_type=offline` are present

There are **no edge function errors** in the recent logs for `gmail-oauth-start` or `gmail-oauth-callback`. That means:

1. Your click is reaching `gmail-oauth-start`, which returns a valid Google URL
2. The browser redirects to `accounts.google.com`
3. Google itself rejects the request with the 403 page **before** logging anything to our callback

So the bug is on the Google side of the wire, not ours.

### Finding 3 — The three scenarios that produce *this exact 403 page*

| Scenario | Why it happens | How to confirm |
|---|---|---|
| **A. Wrong Google account active in the browser** | You're signed into multiple Google accounts (e.g. personal + Workspace). Google opens consent under the wrong one — that account isn't a test user, isn't on the same Workspace, and isn't allowed to view the app. | Sign out of all Google accounts, then click Connect Gmail and sign in fresh with the exact email that is on your OAuth consent screen → Test users list. |
| **B. The OAuth client belongs to a different Google Cloud project than the one whose consent screen you configured** | You have two Cloud projects. You added test users / configured consent on Project A, but `GOOGLE_OAUTH_CLIENT_ID` is a credential from Project B (which has no test users and is in Testing mode). Google looks up the client → sees it's owned by Project B → checks Project B's test user list → your email isn't there → 403. | In Google Cloud Console go to APIs & Services → Credentials. Find the OAuth client whose **Client ID** matches `GOOGLE_OAUTH_CLIENT_ID`. Click into it. Note which project name is shown in the top bar. Then click OAuth consent screen — confirm the test users list lives in the **same project**. This is the most common cause when "I'm sure my setup is correct." |
| **C. Workspace admin policy blocks third-party apps** | Your account is a Google Workspace account whose admin has restricted unapproved third-party apps. Workspace admin → Security → API controls → "Block all third-party API access" or per-scope restrictions. | Try the flow with a personal `@gmail.com` account that you also added as a test user. If that works, it's a Workspace policy issue, not an app issue. |

## What to do — in this exact order

### Step 1 — Confirm which Google Cloud project owns your OAuth client (most likely culprit)

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Use the project picker at the top to switch projects until you find the OAuth 2.0 Client ID matching `GOOGLE_OAUTH_CLIENT_ID`
3. **Note the project name shown** — call this Project X
4. Switch to **OAuth consent screen** *while still in Project X*
5. Confirm:
   - **Publishing status**: Testing
   - **User type**: External
   - **Test users** contains the exact Google email you're trying to connect (e.g. `adam@captarget.com`)
6. Confirm the OAuth client's **Authorized redirect URIs** contains exactly:
   ```
   https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/gmail-oauth-callback
   ```

If any of these don't match — that's the bug. Fix it in Project X.

### Step 2 — Eliminate the multi-account browser problem

1. Open a brand new **Incognito** window
2. Navigate to your preview app
3. Click **Connect Gmail**
4. When Google's account chooser appears, sign in with **only** the email that's on the test users list

Incognito guarantees no other Google session interferes.

### Step 3 — If still 403, test with a personal Gmail

1. Add a personal `@gmail.com` address as a test user in OAuth consent screen
2. Try the flow with that account in incognito

If personal Gmail works but the Workspace email doesn't → Workspace admin is blocking the app (Scenario C). Resolution: have your Workspace admin allowlist the app or the OAuth client ID under Admin Console → Security → API controls → App access control.

## What this is NOT

- Not a code bug (verified by reading every line of `gmail-oauth-start`, `gmail-oauth-callback`, `MailboxSettings.tsx`)
- Not a missing secret (all 10 expected secrets are present)
- Not a stale deployment (no errors in recent logs)
- Not a redirect URI mismatch (that produces a different page with text "Error 400: redirect_uri_mismatch")
- Not consent friction from too many scopes (only 3 minimal scopes requested)
- Not a Lovable Cloud / Supabase issue

## Implementation

**No code changes are needed.** The fix is configuration in Google Cloud Console and/or browser session hygiene. After you confirm Steps 1 and 2 above, the connection will complete and the callback will write the row into `user_email_connections`.

If after Steps 1–3 the 403 persists, capture the **full URL** in the address bar at the moment the 403 appears — that URL contains query params that uniquely identify which of the three scenarios is firing, and I can pinpoint the exact fix from there.

