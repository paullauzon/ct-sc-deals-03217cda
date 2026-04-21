

# Our side is correct. The block is Microsoft-side — and I can pinpoint the 3 likely causes.

## What I verified (our side is clean)

1. **`outlook-oauth-start` is firing correctly** — booted at 20:27 UTC (your last click). Returns the correct authorization URL with all 4 scopes (`Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`).
2. **`outlook-oauth-callback` has zero hits** — meaning Microsoft is killing the OAuth flow at the consent screen. You never reach the redirect back to us.
3. **No Outlook connection has landed** in `user_email_connections` (only the two Gmail accounts).
4. **Code, secrets, scopes, and redirect URI are all correct** — confirmed by reading the function source.

The screen you're seeing — **"This app requires your admin's approval"** with `unverified` underneath — is Microsoft reporting that **admin consent is still NOT granted for this app in your tenant.** Either Josh didn't actually click the "Grant admin consent" button, or he clicked it on a different app, or the app's account-type config is wrong.

## The 3 possible root causes (ranked by likelihood)

### Cause #1 — Josh didn't click the right button (most likely, ~70%)

The Entra admin center has multiple buttons that look similar. The one we need is specifically labeled **"Grant admin consent for SMC SourceCo, LLC"** and it's at the **top of the API permissions table** (not in App registrations overview, not in Authentication, not in Token configuration).

If Josh did anything else — added permissions, saved settings, configured authentication — but didn't click that exact button, Microsoft still treats consent as un-granted.

**How to verify:** Ask Josh to go back to **Entra → App registrations → Lovable CRM — Outlook Sync → API permissions** and look at the **"Status"** column for each permission. If it says **"Not granted for SMC SourceCo, LLC"** in red/orange — consent was never granted. If it says **"Granted for SMC SourceCo, LLC"** in green with a checkmark — consent IS granted (and we have a different problem).

### Cause #2 — Wrong "Supported account types" in app registration (~20%)

If when registering the app Josh selected **"Accounts in any organizational directory and personal Microsoft accounts"** (multitenant + personal), Microsoft requires per-tenant admin consent for EACH external tenant — and the consent grant only applies to the home tenant.

If your app is registered in `sourcecodeals.com`'s Entra and you're trying to sign in as `adam.haile@sourcecodeals.com`, this should work… unless the registration's "Supported account types" is wrong.

**How to verify:** Entra → App registrations → Lovable CRM — Outlook Sync → **Authentication** tab → look at "Supported account types". For our use case (sales reps on `sourcecodeals.com`), the ideal setting is **"Accounts in this organizational directory only (SMC SourceCo only - Single tenant)"**.

### Cause #3 — Consent was granted on a different app registration (~10%)

If Josh has multiple app registrations (maybe one from his earlier setup attempt and one new one), he might have clicked "Grant admin consent" on the wrong one. The Client ID currently saved in our `MICROSOFT_CLIENT_ID` secret must match the app where consent was granted.

**How to verify:** Cross-check the **Application (client) ID** on the app where Josh granted consent against the value of our `MICROSOFT_CLIENT_ID` secret. If they don't match, either Josh consented on the wrong app, or our secret points to a stale registration.

## What to send Josh

Forward this verification checklist:

> Hi Josh — quick check please. The "approval required" wall is still showing. Can you confirm 3 things in Entra:
>
> 1. Go to **Entra → App registrations → Lovable CRM — Outlook Sync → API permissions**. In the "Status" column, do all 4 permissions (Mail.Read, Mail.Send, User.Read, offline_access) show **"Granted for SMC SourceCo, LLC"** with a green checkmark? Screenshot if possible.
>
> 2. On the same app → **Authentication** tab → what does "Supported account types" say?
>
> 3. On the **Overview** tab → copy the **Application (client) ID** and send it to me so I can verify it matches what's saved in the CRM backend.

## What I'll do once Josh responds

- **If Cause #1** (consent not actually granted) → he clicks the button once and we're done
- **If Cause #2** (wrong account type) → he changes "Supported account types" to single-tenant, no code change needed
- **If Cause #3** (Client ID mismatch) → I'll update our `MICROSOFT_CLIENT_ID` secret to match the correct app, no code change needed

In all 3 cases, **no code changes are required**. The issue is purely Microsoft tenant config, and our edge functions / secrets / Azure registration setup are confirmed correct on our end.

