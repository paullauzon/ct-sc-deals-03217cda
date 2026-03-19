

# Backfill All Missing LinkedIn Profiles

## Current State
- **133** leads have LinkedIn URLs
- **50** leads have `NULL` (never searched)
- **8** leads have empty string (previously failed)
- **Total to process: 58 leads**

## Steps

1. **Reset failed leads**: Update the 8 leads with `linkedin_url = ''` back to `NULL` so they're eligible for reprocessing
2. **Run `backfill-linkedin` multiple times**: The edge function has a ~3 minute timeout and processes ~8 leads per run. We'll need ~7 sequential invocations to cover all 58 leads.
3. **Report results** after each run showing progress

### Note on execution
Each invocation picks up all leads where `linkedin_url IS NULL`, processes them in batches until timeout. We'll keep invoking until no leads remain with NULL URLs.

