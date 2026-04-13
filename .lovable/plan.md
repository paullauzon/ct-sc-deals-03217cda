

# Scan Fireflies for 23 Missing Transcripts

## Problem
23 leads have Calendly meetings that already occurred but no Fireflies transcript was linked. They're stuck at "Meeting Set."

## Plan

### 1. Trigger individual Fireflies scans for all 23 leads
Use the existing `run-lead-job` edge function to re-process each of these 23 leads. This function already handles Fireflies matching (email, name, domain, speaker-name fallback) and will:
- Search Fireflies for matching transcripts
- If found: attach the meeting, run AI analysis, advance stage to "Meeting Held"
- If not found: confirm "no meetings" — these were likely no-shows or unrecorded

### 2. Implementation
Write a small script that calls `run-lead-job` for each of the 23 lead IDs sequentially (with a short delay between calls to avoid rate limits). This can be done via `supabase.functions.invoke` or direct HTTP calls to the edge function.

### 3. After processing
Review the results to see which leads got transcripts vs. which confirmed as no-shows. For confirmed no-shows, we can optionally bulk-update their stage or add a note.

## Technical Details
- Use `code--exec` to run a script that calls the `run-lead-job` function for each lead ID
- The 23 lead IDs: SC-T-069, SC-I-039, SC-T-063, CT-190, CT-191, SC-I-038, SC-T-065, SC-I-037, TGT-027, SC-T-062, SC-T-059, SC-I-034, SC-T-054, CT-080, TGT-015, TGT-007, CT-018, CT-019, SC-I-009, SC-I-008, CT-025, CT-028, CT-047
- Sequential processing with ~3s delay between calls
- Log results for each lead (found/not found)

## Files Changed
No code changes needed — this uses existing infrastructure.

