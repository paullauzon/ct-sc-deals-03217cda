

# Fix Calendly Real-Time Webhook → Lead Matching

## What's Wrong

**The webhook IS registered at Calendly** — confirmed by the 409 "Already Exists" response. Calendly is sending `invitee.created` events to the `ingest-calendly-booking` function.

**But the function is broken and can't process them.** There's a duplicate variable declaration on lines 76 and 78:

```typescript
const eventName = payload.scheduled_event?.name || ...  // line 76
const eventName = payload.scheduled_event?.name || ...  // line 78  ← DUPLICATE
```

This causes a compile/runtime error. Every webhook from Calendly hits a broken function and silently fails. Zero logs confirms this — the function crashes before any `console.log` runs.

Additionally, the `register-calendly-webhook` function has a bug in its duplicate detection: it searches for webhooks with `state === "active"` but the Calendly API returns the webhook with a different state label, so it tries to create a new one and gets a 409. This is cosmetic but should be fixed.

## Fix

### 1. Fix `ingest-calendly-booking` — remove duplicate variable (line 78)

Delete line 78 (`const eventName = ...`). The identical declaration on line 76 is the correct one. This single fix will make the webhook functional again.

### 2. Fix `register-calendly-webhook` — improve duplicate detection

Change the existing check from matching only `state === "active"` to also matching `state === "active"` OR just matching by `callback_url` regardless of state. This prevents the false 409 errors.

### 3. Deploy both functions

After fixing, deploy to make the webhook live immediately.

## Result

When someone books via Calendly, the webhook fires instantly, the function matches by email, and the lead moves to "Meeting Set" in real time — no manual backfill needed.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/ingest-calendly-booking/index.ts` | Remove duplicate `const eventName` on line 78 |
| `supabase/functions/register-calendly-webhook/index.ts` | Fix duplicate webhook detection to match by URL regardless of state |

