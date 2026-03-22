

# Assessment: Keep or Revert the Fireflies Changes

## Situation
The trigger case was misidentified (Viktoria Izdebska, not Margarita Tarasova), but Viktoria's transcript **should actually match** via the existing metadata title-matching — her full name "Viktoria Izdebska" appears in the Fireflies title "Viktoria-Izdebska-and-Malik-Hayes-sa". The hyphens act as word boundaries, so `wordBoundaryMatch` should find it.

This means the real issue is likely that **Viktoria's lead was never processed** (she has 0 meetings in the DB), not that the matching logic is broken.

## Recommendation: Keep the changes, they're good improvements

The two changes we made are independently valuable:
1. **Speaker-name fallback** — catches leads whose names only appear in transcript speaker data, not titles. This is a real gap.
2. **Lowered company word minimum (4→2)** — allows short company names like "DB" to match. Also a real improvement.

Neither change introduces risk or breaks anything — the fallback only triggers when metadata finds 0 matches.

## What actually needs to happen

### Step 1: Run Viktoria's lead through the pipeline
She simply needs to be processed — invoke `run-lead-job` for lead CT-180 (Viktoria Izdebska, Techbold, viktoria@izdebska.com). The existing matching logic should find the transcript by her name in the title.

### Step 2: Verify the match
Confirm her meeting "Viktoria-Izdebska-and-Malik-Hayes-sa" gets linked with transcript, summary, and AI analysis.

| Action | Detail |
|--------|--------|
| Code changes | None — keep existing improvements |
| Execution | Run lead job for CT-180 |

