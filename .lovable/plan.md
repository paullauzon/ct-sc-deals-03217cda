

# Automatic Fireflies API Integration

## How It Works

Fireflies provides a GraphQL API at `https://api.fireflies.ai/graphql` that lets you fetch all meeting transcripts programmatically. We'll build an edge function that:

1. Fetches all transcripts from your Fireflies account
2. Runs each through the AI summarizer
3. Returns structured data you can match to leads

## Setup Required

You'll need a **Fireflies API key** from your Fireflies account:
- Go to Fireflies → Settings → Developer Settings → API Keys
- Generate a new key with read access to transcripts

## Changes

### 1. New edge function: `supabase/functions/fetch-fireflies/index.ts`

- Calls Fireflies GraphQL API to list recent transcripts (title, date, transcript text, attendees, duration)
- For each transcript, calls the existing `summarize-meeting` logic inline to generate summary + next steps
- Returns an array of processed meetings: `{ title, date, attendees, transcript, summary, nextSteps, firefliesId }`
- Supports a `limit` param (default 50) and optional `since` date filter

### 2. New UI: "Import from Fireflies" button in the Leads Table toolbar

- Button opens a dialog showing all fetched Fireflies meetings
- Each meeting shows: title, date, attendees, AI summary preview
- User selects which lead to attach each meeting to (dropdown of leads)
- On confirm, the lead's `firefliesUrl`, `firefliesTranscript`, `firefliesSummary`, and `firefliesNextSteps` fields are populated automatically
- Bulk action: "Auto-match" tries to match meetings to leads by attendee email/name

### 3. Auto-match logic

- Compare Fireflies meeting attendee emails/names against lead emails/names
- If a match is found, pre-select that lead in the dropdown
- User confirms or overrides before saving

### 4. `supabase/config.toml`

- Add `[functions.fetch-fireflies]` with `verify_jwt = false`

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/fetch-fireflies/index.ts` | New: fetch transcripts from Fireflies API + summarize each |
| `supabase/config.toml` | Add fetch-fireflies function entry |
| `src/components/LeadsTable.tsx` | Add "Import from Fireflies" button + matching dialog |
| `src/components/FirefliesImport.tsx` | New: dialog component for reviewing and assigning meetings to leads |

## Secret Required

A `FIREFLIES_API_KEY` secret will need to be added via Lovable Cloud before the integration works.

