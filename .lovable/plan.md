

# Register Calendly Webhook Subscription

## Problem
The `ingest-calendly-booking` edge function exists and works, but Calendly was never told to send events to it. Zero webhook deliveries have occurred — all Calendly data came from the manual backfill.

## Solution
Create a one-time utility edge function `register-calendly-webhook` that calls the Calendly API to create a webhook subscription pointing to our `ingest-calendly-booking` endpoint.

### New edge function: `supabase/functions/register-calendly-webhook/index.ts`
- Authenticates with `INGEST_API_KEY`
- Calls `GET /users/me` to get the organization URI
- Lists existing webhook subscriptions to avoid duplicates
- Calls `POST /webhook_subscriptions` with:
  - **url**: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/ingest-calendly-booking`
  - **events**: `["invitee.created"]`
  - **organization**: the org URI from `/users/me`
  - **scope**: `organization`
- Returns the subscription details for confirmation

### Config
Add `[functions.register-calendly-webhook]` block to `supabase/config.toml` with `verify_jwt = false`.

After deployment, we invoke it once. From that point on, every new Calendly booking will automatically hit `ingest-calendly-booking` in real-time.

## Files Changed
| File | Change |
|------|--------|
| `supabase/functions/register-calendly-webhook/index.ts` | New one-time utility to register the webhook |
| `supabase/config.toml` | Add function config block |

