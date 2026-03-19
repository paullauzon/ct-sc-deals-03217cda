

# Continue LinkedIn Backfill for 32 Remaining Leads

## Current State
- **114** leads have LinkedIn URLs (matched)
- **45** leads marked as empty string (previously searched, not found)
- **32** leads with NULL (never searched or reset — these need processing)

## Execution Plan

### Step 1: Reset the 45 empty-string leads back to NULL
Many of these were cleared by the verification pass and deserve a fresh search attempt with the improved agent.

### Step 2: Run `backfill-linkedin` repeatedly
- 5 leads per run, ~15 runs needed for 77 leads (32 NULL + 45 reset)
- Invoke sequentially until remaining = 0
- Each run takes ~30-60 seconds

### Step 3: Report final stats
- Total matched vs genuinely not found
- No code changes needed — just execution

