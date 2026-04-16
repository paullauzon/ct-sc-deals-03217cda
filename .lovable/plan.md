

# Deploy Verification & Serper Credit Fix

## Current Status

The `backfill-linkedin` function **is already deployed** with all 30+ capabilities. The logs from the most recent run confirm:
- Retry delays are `2s` and `5s` (the fix is live)
- Gemini fallback triggers correctly after OpenAI 429 exhaustion
- Serper returns `400: "Not enough credits"` on every search attempt

## The Blocker

**Serper API credits are exhausted.** This breaks 4 critical search paths:
1. Quick-match Serper fallback
2. Agent turn Serper fallback
3. Open web search fallback
4. Strategy D role-filtered search

Without Serper, the system can only find profiles via direct slug guessing, Firecrawl scraping, and email signature mining — roughly 40% of what it's capable of.

## What Needs to Happen

### Step 1: Add Serper Credit Exhaustion Handling
Rather than silently failing, the function should detect the "Not enough credits" error and:
- Log a clear warning once (not per-search)
- Skip all Serper-dependent strategies gracefully
- Continue with Firecrawl-only paths
- Return `serper_exhausted: true` in the response so the UI can surface this

### Step 2: Redeploy and Verify All Entry Points
Deploy the updated function and confirm all 4 entry points work:
- **Auto-trigger**: `ingest-lead` calls `backfill-linkedin` on new leads
- **Batch button**: LeadsTable "LinkedIn Enrich" button
- **Re-enrich Stale**: LeadsTable "Re-enrich Stale" button
- **Deal Room**: "Search Again" button and manual URL paste

### Step 3: Top Up Serper Credits
You'll need to top up your Serper account to restore full search capability. Once credits are available, re-run batch enrichment on the 10 missing leads.

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/backfill-linkedin/index.ts` | Add `serperExhausted` flag — detect "Not enough credits" once, skip Serper calls for remainder of run, include flag in response |

## After Deployment

Once Serper credits are topped up, run batch enrichment from LeadsTable to process the 10 leads still missing LinkedIn URLs.

