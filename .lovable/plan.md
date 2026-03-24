

# Auto-Set Deal Owner from Calendly Host

## How It Works
The Calendly webhook payload includes `scheduled_event.event_memberships` — an array of hosts for the event. Each entry has a `user_email` and `user_name`. We map these to your deal owners (Malik, Valeria, Tomos) and auto-set `assigned_to` on the lead.

## Changes

### 1. Update `ingest-calendly-booking` edge function
- Extract `payload.scheduled_event.event_memberships[0].user_email` (the host)
- Map host email → deal owner name using a lookup object (e.g., `{ "malik@captarget.com": "Malik", "valeria@...": "Valeria", "tomos@...": "Tomos" }`)
- If matched, set `assigned_to` on the lead update
- Log the assignment in the activity log

### 2. Update `backfill-calendly` edge function
- Same logic: extract host from event memberships when iterating events
- Set `assigned_to` for backfilled leads too

### Pre-requisite: Your team's Calendly emails
I'll need to know which Calendly account emails map to which deal owner. For example:
- Malik's Calendly email → "Malik"
- Valeria's Calendly email → "Valeria"  
- Tomos's Calendly email → "Tomos"

| File | Change |
|------|--------|
| `supabase/functions/ingest-calendly-booking/index.ts` | Extract host, map to deal owner, set `assigned_to` |
| `supabase/functions/backfill-calendly/index.ts` | Same host→owner mapping for backfill |

**Before I implement**: What are the Calendly email addresses for Malik, Valeria, and Tomos? I'll hardcode the mapping in the edge functions.

