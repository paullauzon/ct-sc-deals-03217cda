

# Fix: Fireflies Transcript Not Found for Margarita Tarasova

## Root Cause

Margarita Tarasova's meeting exists in the Captarget Fireflies account, but the metadata-first matching engine can't find it because:

1. **Email mismatch**: Her email (margarita.tarasova@db.com) likely isn't listed in the Fireflies meeting's `participants` or `organizer_email` fields — those typically contain the internal team's emails, not the external attendee's.

2. **Domain match fails**: "db.com" (Deutsche Bank) would need to appear in an attendee email — unlikely if the Captarget team organized the meeting.

3. **Name match is title-only**: The metadata query doesn't return attendee/speaker names — only the meeting title. If "Tarasova" or "Margarita" isn't in the title, it won't match.

4. **Company match filtered out**: "DB" is only 2 characters, so it gets excluded by the `w.length >= 4` minimum word length filter in `buildSearchFilter`.

In short: the metadata-first approach (introduced for speed) sacrifices recall — it can't match on speaker names, which are only available in the full transcript.

## Fix Plan

### Step 1: Add speaker-name fallback to fetch-fireflies

When metadata scanning finds 0 matches and search criteria include names, fall back to fetching the most recent N transcripts in full and check speaker names. This recovers the matches that metadata-only mode misses.

Changes to `supabase/functions/fetch-fireflies/index.ts`:
- After metadata scan returns 0 matches, if `searchNames` were provided, fetch the last ~100 transcripts' full data (in batches of 5)
- Apply the existing name matching against `sentences[].speaker_name`
- This is a targeted fallback — only triggers when metadata yields nothing

### Step 2: Lower the company word minimum length from 4 to 2

Change `w.length >= 4` to `w.length >= 2` in `buildSearchFilter` so short company names like "DB" can match in titles. Add "db" to the generic words exclusion list only if it's truly generic (it's not — it's distinctive for Deutsche Bank).

### Step 3: Re-run Margarita's lead processing

Invoke `run-lead-job` for Margarita to verify the fix finds her transcript.

### Technical Details

| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Add speaker-name fallback when metadata scan returns 0 matches; lower company word min length |

The fallback approach preserves the speed of metadata-first scanning (most leads match on email/domain) while ensuring name-only matches aren't lost.

