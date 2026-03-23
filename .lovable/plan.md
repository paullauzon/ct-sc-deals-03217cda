

# Fix: Empty-Transcript Meetings Being Stored Without Processing

## Root Cause

Fireflies creates transcript entries for **forwarded email introductions** (titles containing `<sa>`, `<ext>`, `FW:`) that have **zero audio content** — no sentences, no transcript text. The system:

1. **Finds these in Fireflies** via speaker-name fallback (the metadata matches)
2. **Correctly skips AI processing** (the `transcript.length > 20` guard works)
3. **But still stores them** as meetings with empty transcript, empty summary, no intelligence
4. **No deal intelligence is generated** because all meetings have empty transcripts → `meetingsWithIntel` is empty

Affected leads: Avery Humphries (4 empty meetings), Brandon Anderson (1 of 3), Greg Caso (1), Jared L Curtis (1), Udit Shah (1).

## Fix Plan

### Step 1: Filter out empty-transcript meetings in `run-lead-job`
**File:** `supabase/functions/run-lead-job/index.ts`

After fetching from Fireflies and before the AI processing loop, filter out meetings with empty transcripts (< 50 chars). These are email forwards or bot-only entries — not real meetings.

```
// Filter out meetings with no transcript content (forwarded emails, bot entries)
newMeetings = newMeetings.filter(m => (m.transcript || "").length >= 50);
```

This prevents empty meetings from ever being stored. Log a message for visibility: `"Filtered out X meetings with no transcript content"`.

### Step 2: Clean up existing empty-transcript meetings in DB
**Migration:** Remove the 8 empty-transcript meetings already stored for the affected leads. Update each lead's `meetings` JSONB array to exclude entries where the transcript is empty.

SQL approach:
```sql
UPDATE leads
SET meetings = (
  SELECT COALESCE(jsonb_agg(m), '[]'::jsonb)
  FROM jsonb_array_elements(meetings) m
  WHERE length(m->>'transcript') >= 50
),
deal_intelligence = NULL
WHERE id IN ('CT-051', 'CT-036', 'SC-T-026', 'CT-044', 'SC-I-032');
```

This removes the junk meetings and clears deal intelligence so it can be re-synthesized with real data.

### Step 3: Re-queue affected leads for processing
After cleanup, the affected leads will have fewer (or zero) meetings and their `existingMeetingIds` won't block re-discovery. On the next bulk run, they'll be re-processed and only real meetings with transcripts will be stored.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/run-lead-job/index.ts` | Filter out meetings with transcript < 50 chars before processing |
| DB migration | Remove existing empty-transcript meetings from 5 affected leads |

## Impact
- Prevents future empty meetings from being stored for any lead
- Cleans up 8 existing junk meetings across 5 leads
- Affected leads can be re-processed to find real meetings (if any exist)
- No risk to existing valid meetings (all have transcripts > 25,000 chars)

