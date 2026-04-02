

# Auto-Sync Fireflies Meetings After Calendly Bookings

## Problem

When a Calendly meeting finishes, the Fireflies recording takes ~5-10 minutes to process. Currently, Fireflies meetings only appear when a user manually clicks "Auto-Find" or imports from Fireflies. There's no automatic link between "Calendly meeting ended" and "go fetch the Fireflies transcript."

## Solution

Create a scheduled cron job that runs every 15 minutes, finds leads with Calendly meetings that ended in the last 2 hours, and automatically fetches their Fireflies recordings.

## How It Works

```text
Every 15 min:
  1. Query leads where meeting_date is between 10 min ago and 2 hours ago
     AND meetings JSONB doesn't already contain a Fireflies entry for that time window
  2. For each such lead, call fetch-fireflies with the lead's email/name/company
  3. If a matching transcript is found, attach it to the lead's meetings JSONB
  4. Process through AI (summary, next steps, intelligence) via process-meeting
  5. Update the lead record and log activity
```

The 10-minute buffer gives Fireflies time to process the recording. The 2-hour window ensures we catch meetings even if the cron misses a cycle. Already-attached meetings are skipped via firefliesId dedup.

## Technical Details

### New Edge Function: `sync-fireflies-post-meeting`

- Accepts optional `x-api-key` for auth (uses `INGEST_API_KEY`)
- Queries `leads` table: `meeting_date` is a full ISO timestamp from Calendly
- Filter: `meeting_date` between `now() - 2 hours` and `now() - 10 minutes`
- For each matching lead:
  - Check if `meetings` JSONB already has a firefliesId-bearing entry dated near the Calendly meeting
  - If not, call `fetch-fireflies` with the lead's search criteria (email, name, company, domain)
  - Match the returned meeting by date proximity (within 30 min of the Calendly start time)
  - If found, call `process-meeting` for AI analysis
  - Append the new meeting to the lead's `meetings` JSONB array
  - Advance stage to "Meeting Held" if currently "Meeting Set"
  - Log activity

### pg_cron Schedule

- Enable `pg_cron` and `pg_net` extensions
- Schedule: every 15 minutes
- Calls the edge function with the anon key

### Config

- Add `[functions.sync-fireflies-post-meeting]` with `verify_jwt = false` to `supabase/config.toml`

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/sync-fireflies-post-meeting/index.ts` | New edge function: queries leads with recently-ended Calendly meetings, fetches Fireflies transcripts, processes through AI, attaches to lead |
| `supabase/config.toml` | Add `[functions.sync-fireflies-post-meeting]` block |
| Migration | Enable `pg_cron` and `pg_net` extensions; create cron schedule to invoke the function every 15 minutes |

