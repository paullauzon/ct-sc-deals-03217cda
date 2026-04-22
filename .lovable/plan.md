

# Add copy-link UX + clean up post-admin-consent landing page

## What you'll get

After this change, the Outlook connect dialog will show two recovery options for the "Approval required" wall — open the link **or** copy it to send to Josh — and Josh will land on a proper "Approval received" confirmation page instead of a confusing "Missing authorization code" error.

## Verdict on the URL

The link you pasted is correct and will work. Decoded:

- Endpoint: `login.microsoftonline.com/{your-tenant-GUID}/v2.0/adminconsent` — tenant-scoped
- App: your registered Microsoft app (`client_id` matches)
- Scopes requested: `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access` — identical to the runtime consent
- Redirect: your Supabase callback function — identical to runtime, which means Microsoft will accept it (it's already registered in Azure, otherwise normal connect would fail at the `redirect_uri` check, not at consent)
- State: a harmless return URL back into the CRM

**Two things Josh needs to know before clicking:**
1. He must sign in with an account that has **Global Administrator**, **Privileged Role Administrator**, or **Cloud Application Administrator** on the tenant. A plain user account won't be able to grant tenant-wide consent.
2. After he clicks Accept, Microsoft redirects back to our callback. The current callback shows a benign-but-confusing page because admin-consent returns `tenant=...&admin_consent=True` instead of an authorization `code`. We'll fix this.

## Changes

### 1. `src/components/MailboxSettings.tsx` — add Copy link button + UX polish

- Add `adminConsentUrl` state. Refactor `requestAdminConsent` to fetch the URL once and store it.
- Replace the single "Open admin-consent link" button with a two-button row:
  - **Copy link** — copies the URL to clipboard, shows toast "Copied — paste it to Josh"
  - **Open in new tab** — opens the URL directly (current behavior)
- Once the URL is fetched, also render the URL inline (small, monospace, truncated) so the user can see what's being shared and grab it manually if clipboard is blocked.
- Update the explainer copy to mention the admin must have **Global Admin / Privileged Role Admin / Cloud App Admin** rights, so Josh isn't surprised when he opens it.

### 2. `supabase/functions/outlook-oauth-callback/index.ts` — handle admin-consent redirect

Microsoft's adminconsent flow redirects with `?tenant={GUID}&admin_consent=True&state=...` (no `code`). Today this falls into the "Missing authorization code" branch and shows a generic error.

Add an early branch at the top of the handler:
- If `admin_consent === "True"` (or query has `admin_consent` and no `code`), render a clean success page: **"Tenant admin approval received — users in tenant {GUID} can now connect Outlook normally."**
- If `state` decoded contains a `return_to`, include a "Back to CRM" button that returns to the settings page.
- Log the admin-consent event so we have an audit trail.

### 3. No edge function changes for `outlook-admin-consent-start`

The function already returns the right URL. No change needed there.

## Why I'm not re-asking for tenant admin elevation

The wall you saw is the standard Microsoft tenant policy block, not an Azure misconfiguration. Sending Josh the admin-consent link is the correct, minimal-friction fix. Once he accepts once, the entire SourceCo tenant is approved forever for this app.

## After you ship

1. Open Settings → Mailboxes → Connect Outlook
2. Click **Copy link** in the admin-consent box
3. Send Josh a message like:
   > "Need 30 seconds of admin time. Open this link, sign in with your Microsoft admin account, click Accept. One-time setup so the CRM can sync my Outlook. [paste link]"
4. Once Josh accepts (he'll see a clean confirmation page), come back and click **Connect Outlook** with your own account — the wall is gone, you'll go straight through normal consent and connect.

