

# Verify All LinkedIn Matches & Fix Issues

## Problem
The `verify-linkedin-matches` function uses the Lovable AI gateway (`ai.gateway.lovable.dev`), which is returning **HTTP 402 (credits exhausted)** for every request. All 137 leads came back as "uncertain" — none were actually verified.

## Root Cause
The `backfill-linkedin` function was already switched to use **OpenAI directly** (`api.openai.com` with `OPENAI_API_KEY`), but `verify-linkedin-matches` was never updated — it still uses the Lovable gateway.

## Fix

### Step 1: Update `verify-linkedin-matches` to use OpenAI directly
- Switch from `ai.gateway.lovable.dev` → `api.openai.com/v1/chat/completions`
- Use `OPENAI_API_KEY` instead of `LOVABLE_API_KEY`
- Use `gpt-4o-mini` (fast, cheap, sufficient for verification)
- Reduce `BATCH_SIZE` from 5 to 3 to avoid rate limits

### Step 2: Run verification in dry-run mode
- Deploy the updated function
- Invoke with `{"dry_run": true}` to see which matches are wrong without clearing them

### Step 3: Run for real to clear bad matches
- Invoke without dry_run to clear wrong matches (sets linkedin_url to NULL)

### Step 4: Re-run backfill for cleared leads
- Invoke `backfill-linkedin` to re-search for the leads whose bad matches were cleared

### Step 5: Also update `backfill-linkedin-website` (same issue)
- This function also uses the Lovable gateway for AI verification — switch to OpenAI too

### Changes Summary
| File | Change |
|------|--------|
| `supabase/functions/verify-linkedin-matches/index.ts` | Switch AI calls from Lovable gateway to OpenAI API directly |
| `supabase/functions/backfill-linkedin-website/index.ts` | Switch AI calls from Lovable gateway to OpenAI API directly |

