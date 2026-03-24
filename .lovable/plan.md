

# Backfill Calendly Bookings for Existing Leads

## Problem
The Calendly webhook was just activated today, so all historical bookings (like Sebastian Kocsis's March 30 Introductory Call) were never received. We need a one-time backfill that pulls all scheduled events from the Calendly API and matches invitee emails to existing leads.

## How It Works
1. New edge function `backfill-calendly` fetches all scheduled events from `https://api.calendly.com/scheduled_events` using the `CALENDLY_API_TOKEN`
2. For each event, fetches the invitees list to get their emails
3. Matches each invitee email against leads in the database
4. For leads still in a pre-meeting stage (New Lead, Contacted, Qualifying), updates them to "Meeting Set" with the correct meeting date and `calendly_booked_at` timestamp
5. For leads already past "Meeting Set", just stamps `calendly_booked_at` so the Calendly icon shows up (doesn't regress their stage)
6. Returns a summary of all matches, updates, and skips

## Changes

### 1. New edge function: `backfill-calendly`
**`supabase/functions/backfill-calendly/index.ts`**

- Authenticated via `INGEST_API_KEY`
- Fetches paginated scheduled events from Calendly API (status=active, min_start_time defaults to 30 days ago)
- For each event, fetches `/scheduled_events/{uuid}/invitees`
- Matches invitee emails to leads table
- Updates matched leads:
  - If pre-meeting stage → advance to "Meeting Set" + set meeting_date, calendly_booked_at, hours_to_meeting_set
  - If already past "Meeting Set" → only set calendly_booked_at (so the icon shows)
- Logs activity for each update
- Returns JSON summary of all results

### 2. Add config block
**`supabase/config.toml`**: Add `[functions.backfill-calendly]` with `verify_jwt = false`

After deployment, we invoke it once to backfill Sebastian Kocsis and any other leads with existing Calendly bookings.

| File | Change |
|------|--------|
| `supabase/functions/backfill-calendly/index.ts` | New edge function |
| `supabase/config.toml` | Add function config block |

