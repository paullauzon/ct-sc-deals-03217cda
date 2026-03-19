

# Fix LinkedIn Match Accuracy — AI Verification on Every Match

## Problem

The current system has a fundamental flaw: **Pass 1 and Pass 2 blindly accept the first Google result** without any validation. Only Pass 3 (name-only) validates against company. This means:

- "Michael Tindall" at "Modern Distribution" → Google returns a Michael Tindall at Commio (wrong person)
- "Ben Griffith" at "GMAX Industries" → matched to someone at ANTIMATTER INDUSTRIES
- "Gabriel Fogel" at "Brickell Bay Holdings" → matched to "Brandon Camelione" (completely different person!)
- "Cinzel Washington" at "Cinzel" → matched to a Brazilian "Washington Silva"
- "David Dawson" at "Bloodhoundsmedia" → matched to someone at Hamtramck High School

At least ~20-30 of the 99 current matches are likely wrong.

## Root Cause

Pass 1 searches `"Michael Tindall" "Modern Distribution"` on LinkedIn, gets 0 results, falls through to searching `"Michael Tindall" "modern"` — and the first LinkedIn result happens to be some other Michael Tindall whose snippet contains the word "modern" somewhere. Same pattern for Pass 2 with email domains.

## Solution: Two-Phase Approach

### Phase 1: AI Verification of All 99 Existing Matches (no Serper credits needed)

Create a new edge function `verify-linkedin-matches` that:
1. Fetches all 99 leads with existing `linkedin_url`
2. For each, sends to AI (Gemini 2.5 Flash) with **ALL available context**:
   - Name, company, email, company_url, role, message (their submission text describing their business)
   - The linkedin_url and linkedin_title (snippet from search)
3. AI returns: `"correct"`, `"wrong"`, or `"uncertain"`
4. Wrong matches get cleared (`linkedin_url = NULL`) so they can be re-searched
5. Uncertain matches get flagged for manual review

**Key insight**: The `message` field contains rich context like "I run corp dev for a home services business" or "Robotics & industrial automation field services" — this is extremely valuable for verification that we're currently ignoring entirely.

### Phase 2: Rewrite Backfill to Always Verify

Update `backfill-linkedin/index.ts`:
1. **Remove blind trust from Pass 1 and Pass 2** — collect ALL candidates from all passes into one list
2. **Send top 3-5 candidates to AI** with full lead context (name, company, email, role, message, company_url)
3. AI picks the best match or says "none"
4. Only accept AI-confirmed matches

This costs 0 extra Serper credits (we still do the same searches), just adds 1 AI call per lead.

### Phase 3: Re-run for Cleared + Remaining

After verification clears bad matches, re-run the improved backfill to:
- Re-search the ~20-30 cleared bad matches with the new always-verify logic
- Process any remaining unmatched leads

## Files Changed

- **`supabase/functions/verify-linkedin-matches/index.ts`** — New function: AI-verify all 99 existing matches
- **`supabase/functions/backfill-linkedin/index.ts`** — Rewrite to collect all candidates then AI-verify before accepting
- **`supabase/functions/enrich-lead-scoring/index.ts`** — Mirror the same always-verify approach
- **`supabase/config.toml`** — Register new function

## Cost Estimate

- Phase 1: ~99 AI calls (Lovable AI gateway, free) — no Serper credits
- Phase 2+3: ~87 unmatched × 3-4 Serper queries + ~30 re-searches × 3-4 queries = ~470 Serper credits (you have 646)
- Plus ~120 AI verification calls (free)

## Expected Outcome

- Remove ~20-30 incorrect matches
- Re-find ~10-15 of those with correct profiles using AI verification
- Net result: fewer total matches but **much higher accuracy** (estimated 80-90 correct vs current ~70 correct out of 99)

