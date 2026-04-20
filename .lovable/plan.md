

# Gmail integration — end-to-end audit

I traced the full flow: connect → callback → token refresh → sync → send → tracking. Found **5 real issues** that will bite you when you re-test, plus 2 minor polish items. Fixing all of them now.

## Critical bugs

### 1. `connectGmail` makes a wasted call that shows a confusing error

In `MailboxSettings.tsx`, the connect flow does this:
```ts
// pointless: invoke() without args triggers the function with no params
await supabase.functions.invoke("gmail-oauth-start", { body: null });
// then we throw away the result and call it again with fetch()
```
The first `invoke()` call hits the function with no `user_label` / `return_to`, succeeds, and we throw the response away. Then we make the real call with `fetch()`. If the first call ever errors (CORS, deploy timing), we surface a misleading `toast.error` and abort — even though the real call would have worked.

**Fix:** delete the dead `invoke()` call. Only call the GET endpoint once with the proper query params.

### 2. Returning to Preview vs Live — fragile fallback URL

In `gmail-oauth-callback` line 137:
```ts
const redirect = returnTo || `${SUPABASE_URL?.replace(".supabase.co", ".lovable.app")}/#sys=crm&view=settings&connected=1`;
```
This builds `https://qlvlftqzctywlrsdlyty.lovable.app/...` as the fallback, which is **not a real URL**. If `state` decoding ever fails (e.g. browser drops the param), the user lands on a 404. The fallback should be a sane known URL or a self-contained "you can close this tab" page (which we already render at the top).

**Fix:** drop the broken fallback. If `returnTo` is empty, just render the success card without auto-redirect.

### 3. `lead_emails` schema mismatch will break inbound sync inserts

Look at the `lead_emails` table schema vs what `sync-gmail-emails` inserts:

| Field inserted by sync | Table column | Result |
|---|---|---|
| `lead_id: "unmatched"` | `lead_id text NOT NULL` | works (no FK) |
| `provider_message_id` | exists | works |
| `is_read` | exists | works |

Schema looks compatible — but I need to double check the dedup OR query syntax. The line:
```ts
.or(orParts.join(","))
```
…with `provider_message_id.eq.${mid}` — Gmail message IDs are alphanumeric, safe. But `message_id.eq.${rfc822Id}` includes characters like `<`, `>`, `@`, `.` which break PostgREST `.or()` filter syntax. The current code does `rfc822Id.replace(/,/g, "")` but doesn't escape `<>` or wrap in quotes. **Result: dedup will silently fail or 400 the request for many real emails.**

**Fix:** dedup against `provider_message_id` only (Gmail's own ID is the reliable unique key). Drop the message_id OR clause.

### 4. Duplicate dedup check causes double-skip log noise

In `sync-gmail-emails` lines 360–375 (approx), there's literally two identical `if (existing && existing.length > 0)` blocks back-to-back — the second one is unreachable but the first one increments `skipped_dup` for CRM-sent messages incorrectly (those should be a separate counter).

**Fix:** remove the dead second block; relabel CRM-sent skips so they don't pollute the dup counter.

### 5. Connecting Gmail with the same account that's the mailbox owner = self-match noise

If you connect `adam@captarget.com` and Adam emails himself or is in cc on internal threads, the inbound sync will try to insert those messages with `lead_id="unmatched"` because `captarget.com` is in `INTERNAL_DOMAINS` (good) — but the `skipped_internal` counter handles this correctly. Confirmed not a bug, just verifying.

## Polish items

### 6. `MailboxSettings` "Reconnect required" logic has an edge case

The check is:
```ts
const tokenExpired = c.token_expires_at && new Date(c.token_expires_at) < new Date();
const staleSync = !c.last_synced_at || (Date.now() - new Date(c.last_synced_at).getTime()) > 7 days;
const needsReconnect = c.is_active && tokenExpired && staleSync;
```
A brand-new connection has `last_synced_at = null` → `staleSync = true`, and `token_expires_at` is set ~1 hour in future → `tokenExpired = false`. Good, no false positive. But after the first hour with no sync clicks, token expires → both true → shows "Reconnect required" even though refreshing the token would work fine. That's wrong messaging.

**Fix:** stricter check — only show "Reconnect required" if we've actually attempted a refresh and it failed. Track `refresh_failed_at` in the DB on next refresh attempt; for now, change the threshold to "token expired AND no successful sync ever AND created >24h ago" so new connections aren't flagged.

### 7. No surfaced error when sync runs but matches zero leads

After clicking "Sync now", if 0 of the messages match leads, the toast says `"Synced 47 messages — 47 new, 0 matched, 0 duplicate"` which sounds broken. Add a hint: "0 matched — emails saved as 'unmatched' and will be linked when leads are added."

## Implementation

Files to change:
1. `src/components/MailboxSettings.tsx` — fix #1 (remove dead invoke call), fix #6 (better reconnect heuristic), fix #7 (clearer toast)
2. `supabase/functions/gmail-oauth-callback/index.ts` — fix #2 (drop broken fallback URL)
3. `supabase/functions/sync-gmail-emails/index.ts` — fix #3 (dedup on provider_message_id only), fix #4 (remove dead block, fix counters)

No DB migrations needed. No Google Console changes needed.

## What this does NOT touch

- `gmail-oauth-start` — clean, no changes
- `send-gmail-email` — already inlined token refresh, no changes
- `refresh-gmail-token` — clean, no changes
- `track-email-open` — out of scope for this audit pass
- `supabase/config.toml` — all functions already have `verify_jwt = false`

After these fixes, you can re-test the connect flow with confidence. The Google Console must still have your email in Test Users — that's an external config requirement no code change can bypass.

