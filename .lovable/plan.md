

# LinkedIn Enrichment: Critical Blocker — Firecrawl Search Returns Empty

## What the Tests Revealed

I deployed the function and tested on 2 leads (CT-222 Erik Ott, CT-220 Wasif Khan). The entire pipeline works correctly:
- Deployment: confirmed
- Auto-trigger from ingest-lead: confirmed
- AI rationalization: working (Gemini fallback succeeds when OpenAI 429s)
- Agent turns: running 7-8 turns with smart query evolution
- Direct slug guessing: working
- Company website scraping: working

**But every single Firecrawl Search call returns zero results.** Not an error — HTTP 200 with an empty data array. This happened on 20+ searches across both leads, including simple queries like `"Wasif Khan" Zaphyr site:linkedin.com/in`.

## Root Cause

Firecrawl Search and Serper are fundamentally different products:
- **Serper** = direct Google SERP API (same results as google.com)
- **Firecrawl Search** = web search with optional scraping, but may use a different search index or have restricted Google access for `site:linkedin.com` queries

The replacement worked syntactically (drop-in interface) but not functionally — Firecrawl's search doesn't return LinkedIn results the way Serper did.

## Two Issues to Fix

### Issue 1: Firecrawl Search returns empty (the blocker)
Add debug logging to see the raw Firecrawl response body, and consider whether Firecrawl's search needs different query formatting (e.g., without `site:` operators which it may not support).

### Issue 2: OpenAI is persistently 429'd
Every single OpenAI call fails. The Gemini fallback works, but the 7-second retry delay (2s + 5s) on every AI call adds ~7s of wasted time per turn. With 8 turns, that's ~56 seconds of pure backoff.

## Proposed Fix

### File: `supabase/functions/backfill-linkedin/index.ts`

**Fix 1: Debug Firecrawl responses**
Add `console.log` of the raw Firecrawl response body (first 500 chars) when results are empty, so we can see what Firecrawl is actually returning. This will tell us if the response structure changed, or if we need to adjust query formatting.

**Fix 2: Try Firecrawl without `site:` operators**
Firecrawl's search API may not support Google `site:` operators. Adjust queries to include "linkedin.com/in" as a keyword instead of a `site:` filter, e.g.:
- Before: `"Erik Ott" Shield8 site:linkedin.com/in`
- After: `"Erik Ott" Shield8 linkedin.com/in`

**Fix 3: Skip OpenAI retries entirely when persistently 429'd**
If the first call to OpenAI returns 429, set a session flag and go straight to Gemini for all subsequent calls. This saves ~7s per AI call and prevents the function from burning its timeout on backoff.

**Fix 4: Add Serper back as primary search, Firecrawl as fallback**
Since Firecrawl search clearly doesn't match Serper's Google coverage for LinkedIn queries, the best architecture is:
- Use Serper as the primary search engine (once credits are topped up)
- Use Firecrawl as a scraping tool only (for slug verification, website mining, etc.)
- Keep the `_serperExhausted` graceful degradation flag

This is the honest conclusion: Serper and Firecrawl serve different purposes. Serper is a Google results API. Firecrawl is a web scraping API with a search feature that has weaker coverage.

## Recommendation

The fastest path to getting enrichment working again:
1. Apply Fixes 1-3 immediately to diagnose and optimize
2. If Firecrawl search truly cannot find LinkedIn profiles, restore Serper as the search engine and top up credits (~$50 for 10K searches, covers months of usage)
3. Keep Firecrawl for what it's good at: scraping profile pages, company websites, and team pages

