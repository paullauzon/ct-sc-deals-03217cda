

# Import Gap Fix: LinkedIn, Kick-Off Meetings, and Missing Context

## Current State (280 leads in Revisit/Reconnect)

| Field | Has Data | Missing | Issue |
|---|---|---|---|
| LinkedIn URL | 47 | **233** | CSV column 38 ("Main LinkedIn Profile") was never mapped during import |
| Kick-Off Meetings | **0** | ~15+ | Fix script ran but `meetings_added: 0` — likely column index mismatch |
| Pipedrive Context in notes | 159 | 121 | 121 had no data in context columns — correct |
| Billing/contract data | 9 | 271 | Fix script only found 0 new billing rows — column parsing issue |
| Scoring | 280 | 0 | Done |
| Owners | 280 | 0 | Done |
| Websites | 172 | 108 | Need AI enrichment for these |
| Fireflies URL | 110 | 170 | Already captured what CSV had |

## Root Causes

1. **LinkedIn URLs from CSV never imported.** The original Python import script didn't map CSV column 38 to `linkedin_url`. The fix script also didn't address it. ~80+ leads in the CSV have a LinkedIn URL that's sitting unimported.

2. **Kick-Off Call URLs not stored.** The fix script reported `meetings_added: 0` — the column index for "FireFlies Kick-Off Call" (col 43) may have been misread due to multi-line CSV fields causing row/column misalignment.

3. **Contract billing amounts barely populated (9 total).** Same multi-line CSV parsing issue likely shifted columns for many rows.

## Fix Plan

### Step 1: Re-parse CSV and patch LinkedIn, kick-off calls, and billing
Write a corrected Python script that:
- Uses Python `csv` module (handles multi-line correctly)
- For each CSV row matched by email to a DB lead, **UPDATE**:
  - `linkedin_url` from column 38 ("Main LinkedIn Profile") — only if lead currently has no LinkedIn
  - `meetings` array — append kick-off call from column 43 ("FireFlies Kick-Off Call") if it's a URL
  - `subscription_value` from column 34 ("Contract Billing Amount") — if currently 0
  - `contract_start` from column 32 ("First Payment Date")
  - `contract_end` from column 33 ("Contractual End Date")
- Match by email (lowercase) against existing DB leads
- Log counts for each field updated

### Step 2: Trigger `backfill-linkedin` for remaining gaps
After importing CSV LinkedIn URLs, ~150+ leads will still lack LinkedIn. These need the AI enrichment agent. Run `backfill-linkedin` in batches (5 per run, ~30 runs needed).

### Step 3: Trigger `backfill-linkedin-website` for 108 leads missing websites
Run the website enrichment for leads with no `company_url`.

### Step 4: Update pipeline memory
Update `mem://features/pipeline-workflow` from 11 to 13 stages.

## No schema changes needed
All fields already exist in the database.

## Estimated scope
- 1 Python script via `code--exec` (CSV re-parse + DB patch)
- 2-3 edge function invocations for enrichment batches
- 1 memory file update

