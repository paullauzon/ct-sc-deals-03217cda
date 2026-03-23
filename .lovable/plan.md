

# Build Calendly Webhook Integration

## How It Works

1. **Calendly Setup**: You configure a webhook in Calendly (under Integrations → Webhooks) pointing to our endpoint. Subscribe to the `invitee.created` event.
2. **When someone books**: Calendly sends a POST with the invitee's email, name, scheduled time, and event details.
3. **Our function**: Matches the booking to an existing lead by email, then auto-updates their stage to "Meeting Set" with the correct dates and timing metrics.

## Changes

### 1. New edge function: `ingest-calendly-booking`
**`supabase/functions/ingest-calendly-booking/index.ts`**

- Accepts Calendly `invitee.created` webhook payload
- Authenticates via `INGEST_API_KEY` header (reuses existing secret)
- Extracts: invitee email, invitee name, scheduled event start time, event type name
- Looks up existing lead by email in the `leads` table
- If found and stage is before "Meeting Set":
  - Updates `stage` → "Meeting Set"
  - Sets `meeting_date` to the scheduled event time
  - Sets `meeting_set_date` to now
  - Calculates `hours_to_meeting_set` (hours between `created_at` and now)
  - Sets `stage_entered_date` to now
  - Logs activity via insert to `lead_activity_log`
- If no matching lead found, logs a warning (the lead will arrive via Zapier separately)
- Returns 200 OK to Calendly

### 2. Add to `supabase/config.toml`
Add `[functions.ingest-calendly-booking]` with `verify_jwt = false` (webhook from external service).

## Calendly Setup Instructions
After deployment, you'll configure in Calendly:
- **URL**: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/ingest-calendly-booking`
- **Header**: `x-api-key: <your INGEST_API_KEY value>`
- **Event**: `invitee.created`

| File | Change |
|------|--------|
| `supabase/functions/ingest-calendly-booking/index.ts` | New edge function |
| `supabase/config.toml` | Add function config block |

