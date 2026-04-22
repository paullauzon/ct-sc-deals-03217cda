
# Outlook connect failure — root cause and fix plan

## What is actually happening

The screenshot is not a frontend crash. It is Microsoft explicitly blocking the OAuth consent flow at the identity layer.

`Approval required` means the request is reaching Microsoft correctly, but the tenant is refusing end-user consent for this app + scope combination.

## Deep diagnosis

### 1. The tenant-scoped URL did not solve the real blocker
The code now correctly uses:

- `outlook-oauth-start` → `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`
- `outlook-oauth-callback` and token refresh paths → tenant-specific token endpoints

That fixed the wrong-tenant problem, but it does **not** bypass tenant consent policy.

### 2. The previous assumption was wrong
The memory and earlier audit claimed tenant scoping would bypass the admin-consent problem. The screenshot disproves that.

For the requested delegated scopes:

- `Mail.Read`
- `Mail.Send`
- `User.Read`
- `offline_access`

many Microsoft tenants still require admin approval, depending on tenant consent policy. So the current blocker is not missing code in sync/send/backfill anymore — it is tenant permission governance.

### 3. The code is also making the consent UX worse
`supabase/functions/outlook-oauth-start/index.ts` still forces:

- `prompt=consent`

Microsoft docs note this can keep re-triggering consent flows and surface consent errors repeatedly. Even after approval, this is the wrong default for a production mailbox connect flow.

### 4. Current product gap
The app has no graceful handling for this exact Microsoft response:
- user gets bounced to Microsoft's approval screen
- no in-app explanation of what failed
- no admin-specific recovery path
- no generated admin-consent URL
- no structured diagnostics for tenant policy vs misconfiguration

So the integration is technically wired, but operationally incomplete.

## Most likely actual causes inside Microsoft

Based on the screenshot and Microsoft consent docs, one of these tenant-side conditions is true:

1. **User consent is disabled** for apps in the SourceCo tenant
2. **The enterprise app exists but lacks granted permissions** for the requested scopes
3. **Assignment required** is enabled on the enterprise app
4. The tenant allows only low-risk consent, and `Mail.Read` / `Mail.Send` are blocked for self-consent

The screenshot strongly points to 1 or 4.

## What I will build

### A. Remove forced re-consent
Update `supabase/functions/outlook-oauth-start/index.ts` to stop sending `prompt=consent` by default.

Result:
- existing approved users won’t be forced through consent every time
- we stop inflaming consent-policy failures

### B. Add explicit Microsoft admin-approval handling
Upgrade the Outlook auth flow so Microsoft consent denials are handled intentionally, not as a dead-end.

#### In `outlook-oauth-callback`
Detect Microsoft approval-related responses and render a proper outcome page that explains:
- this is a tenant approval block, not a CRM bug
- the requested permissions
- what the tenant admin must do
- how the user should retry after approval

### C. Add an admin-consent path
Create a dedicated Outlook admin-consent start flow that generates the proper Microsoft admin-consent URL for the tenant.

This gives you something actionable to send to Josh / tenant admin instead of telling reps to keep retrying.

### D. Add structured diagnostics
Return predictable JSON payloads from the Outlook auth edge functions for machine-readable failure states, including:
- `error_stage`
- `tenant_id`
- `requested_scopes`
- `microsoft_error`
- `microsoft_error_description`
- whether this is likely `admin_approval_required`

This prevents another vague “it should work” loop.

### E. Improve frontend handling in `MailboxSettings.tsx`
When Outlook connect fails or approval is required, show a clean in-app explanation instead of silently handing everything to Microsoft.

Planned UX:
- “Your organization requires admin approval before Outlook can be connected.”
- copyable justification text
- button or instructions for admin approval flow
- clearer distinction between:
  - config error
  - user cancelled
  - admin approval required
  - token exchange failed

## Files to update

- `supabase/functions/outlook-oauth-start/index.ts`
- `supabase/functions/outlook-oauth-callback/index.ts`
- `src/components/MailboxSettings.tsx`

Likely add:
- `supabase/functions/outlook-admin-consent-start/index.ts`

## Validation after the fix

Once the admin has approved the app, I’ll verify the full chain:

1. Outlook connect completes without the approval wall
2. `user_email_connections` gets an active Outlook row
3. auto 90-day backfill starts
4. `email_backfill_jobs` advances correctly
5. `lead_emails` rows land with `source = 'outlook'`
6. lead matching assigns emails to the correct leads
7. threading uses `conversationId` correctly
8. 5-minute sync cron runs successfully
9. send flow works and does not re-ingest CRM-sent emails

## Expected outcome

After this work:
- the app will correctly explain the real blocker
- you’ll have an admin-approval path instead of a dead-end
- the Outlook flow will stop forcing unnecessary re-consent
- once tenant approval is granted, the existing sync/send/backfill pipeline can actually go live cleanly
