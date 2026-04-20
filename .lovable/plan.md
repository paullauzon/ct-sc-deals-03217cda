
## What still needs to be fixed before you retry Gmail connect

I audited the full connection path again: frontend connect button → `gmail-oauth-start` → Google consent → `gmail-oauth-callback` → token storage → refresh/sync/send. The core plumbing is present, but there are still a few code-level reliability issues that can break or weaken the connection flow even when your Google setup is correct.

### Most likely blocker still in the code

1. **Unicode label bug in `gmail-oauth-start`**
   - The function uses `btoa(JSON.stringify(stateObj))`.
   - `btoa` is not Unicode-safe.
   - The UI prompt example literally suggests a label like `Adam — Captarget`, and the em dash can make `btoa(...)` throw.
   - Result: OAuth start fails before Google even opens.

This is the highest-priority fix.

## Implementation plan

### 1) Harden the OAuth start flow
Update `supabase/functions/gmail-oauth-start/index.ts` to:
- Replace raw `btoa(JSON.stringify(...))` with UTF-8-safe base64url encoding using `TextEncoder`
- Validate/sanitize `user_label` and `return_to`
- Reject obviously invalid `return_to` values instead of blindly trusting them
- Remove the unnecessary browser `Authorization: Bearer {publishable key}` dependency from the frontend call so the request is a simpler GET without avoidable auth/preflight complexity

### 2) Harden the OAuth callback
Update `supabase/functions/gmail-oauth-callback/index.ts` to:
- Decode `state` with a UTF-8-safe base64url decoder using `TextDecoder`
- Restore base64 padding before decoding so callback state parsing does not fail intermittently
- Fail clearly if Google does not return a usable refresh token for a new mailbox
- Preserve old refresh token only for reconnects to an existing mailbox
- Return clearer error pages for:
  - token exchange failure
  - missing refresh token
  - invalid callback state
  - profile fetch failure
- Keep the current safe behavior of rendering success instead of redirecting to a fake fallback URL

### 3) Reduce OAuth fragility by trimming unused scopes
Update `supabase/functions/gmail-oauth-start/index.ts` scopes to remove anything not actually used:
- remove `gmail.modify`
- remove `userinfo.profile`
- keep only what the current integration actually needs:
  - `gmail.readonly`
  - `gmail.send`
  - `userinfo.email`

This reduces consent friction and removes one unnecessary risk surface.

### 4) Make the frontend connection flow more deterministic
Update `src/components/MailboxSettings.tsx` to:
- stop sending the unnecessary Authorization header to `gmail-oauth-start`
- keep the current single-call connect flow
- improve the connect failure toast so it surfaces backend text more clearly
- optionally replace `window.prompt()` with a small dialog/input later, but for now keep it if needed and ensure labels with punctuation/unicode are safe

### 5) Prevent “connected but unusable” mailbox records
Update callback logic so it does **not** save a mailbox as active unless the mailbox is actually usable:
- if there is no refresh token on first connect, do not create/activate the row
- if token exchange succeeds but profile lookup fails, do not create/activate the row
- only upsert after all required Gmail credentials are confirmed valid

### 6) Re-check downstream Gmail lifecycle consistency
While implementing, keep these aligned across:
- `refresh-gmail-token`
- `sync-gmail-emails`
- `send-gmail-email`

Specifically:
- all should treat missing refresh token as reconnect-required
- all should rely on the same `user_email_connections` assumptions
- no function should silently succeed against a half-configured mailbox row

## Files to change

1. `supabase/functions/gmail-oauth-start/index.ts`
2. `supabase/functions/gmail-oauth-callback/index.ts`
3. `src/components/MailboxSettings.tsx`

## Validation after implementation

### Functional checks
1. Start Gmail connect with an ASCII label like `Adam Captarget`
2. Start Gmail connect with a Unicode label like `Adam — Captarget`
3. Confirm Google opens in both cases
4. Complete consent
5. Confirm callback writes one active row into `user_email_connections`
6. Confirm the user lands back in settings with `connected=1`
7. Click `Refresh token`
8. Click `Sync now`

### Failure-path checks
1. Callback with missing code shows friendly error page
2. Callback with invalid state still handles gracefully
3. Missing refresh token does not create a fake-active mailbox
4. Reconnect updates the existing mailbox instead of duplicating it

## Expected outcome

After these fixes, the Gmail connection flow will be robust against:
- Unicode mailbox labels
- malformed/fragile state decoding
- partial mailbox saves
- unnecessary preflight/auth complexity
- unused Google scopes increasing risk

If your Google client ID, secret, redirect URI, and consent setup are already correct, this is the set of code changes most likely to make the connection succeed on the next try.
