

# Backfill All Missing LinkedIn Profiles + Verify Auto-Enrichment

## Current State
- **133** leads have LinkedIn URLs (found)
- **42** leads have `NULL` (never searched)
- **16** leads have empty string (previously failed, worth retrying)
- **Total to process: 58 leads**

## Auto-enrichment for new leads: Already implemented ✓
`ingest-lead/index.ts` already fires a request to `backfill-linkedin` with the new `leadId` immediately after lead creation (lines 319-329). The `backfill-linkedin` function's single-lead mode (lines 454-499) handles this correctly. No code changes needed here.

## Plan

### Step 1: Reset 16 failed leads
Run `UPDATE leads SET linkedin_url = NULL WHERE linkedin_url = '';` so all 58 leads are eligible for processing.

### Step 2: Run backfill-linkedin repeatedly until done
The function processes 5 leads per run. With 58 leads, that's ~12 invocations. I'll invoke the function in a loop, checking remaining count after each run, and stop when remaining = 0.

### Step 3: Report final results
Show breakdown of matched vs genuinely not found.

### No code changes required
Both `backfill-linkedin` (batch + single-lead modes) and `ingest-lead` (auto-trigger) are already correctly implemented. This is purely an execution task.

