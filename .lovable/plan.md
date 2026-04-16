

# LinkedIn Enrichment: End-to-End Strategy for 99% Discovery Rate

## Current State

You have a solid foundation:
- **Rationalization** (just added): AI pre-analyzes names, nicknames, email patterns before searching
- **Quick-match shortcut**: Auto-accepts when snippet matches company + last name
- **AI Search Agent**: Multi-turn Firecrawl-powered search with 3 pre-search strategies (company LinkedIn page, email initials, company website scrape)
- **Post-match verification**: `verify-linkedin-matches` function validates existing matches
- **Post-match enrichment**: Title extraction, M&A experience detection, seniority scoring

## Gap Analysis: Where Leads Still Get Lost

### 1. Single-name leads are auto-rejected
The system skips anyone whose name doesn't have 2+ parts with 2+ characters each (line 795). "Dante" gets skipped entirely — but with a company name and email, a LinkedIn search is still viable.

### 2. No post-verification re-search loop
`verify-linkedin-matches` clears wrong matches but doesn't trigger a re-search. Cleared leads sit with `linkedin_url = NULL` and never get re-processed unless someone manually runs the backfill again.

### 3. Verification is decoupled from discovery
Discovery (backfill-linkedin) finds a profile and writes it immediately. Verification (verify-linkedin-matches) runs separately. There's no inline verification — if the agent finds a wrong profile, it's written to the DB and stays wrong until someone runs verify.

### 4. No Google Search fallback
Firecrawl search is the only search provider. Sometimes Google finds LinkedIn profiles that Firecrawl misses. The SERPER_API_KEY is already configured but unused for LinkedIn discovery.

### 5. No direct LinkedIn URL construction + check
For obvious cases, you could construct `linkedin.com/in/firstname-lastname` and try to scrape it directly. Many profiles follow this pattern. Currently the system always goes through search first.

### 6. No "confident enough to skip agent" fast path beyond quick-match
The quick-match only works when the snippet contains both company AND last name. But sometimes the rationalization is so confident (e.g., unique last name + company match) that a single search + slug verification should suffice without entering the full agent loop.

### 7. Batch runs limited to 5 leads
`MAX_LEADS_PER_RUN = 5` means you need to click the button many times. No auto-continuation or UI feedback on remaining count.

### 8. No learning from past failures
When a lead fails, the `gaveUpReason` is logged but not stored in the DB. Next retry starts from scratch with no memory of what was tried.

## Strategic Improvements (Ranked by Impact)

### Phase 1: Immediate Wins (High Impact, Low Effort)

**A. Inline Verification During Discovery**
After the agent says "found", run a lightweight verification check (same logic as verify-linkedin-matches) before writing to DB. If it fails, continue searching instead of writing a bad match. This eliminates ~80% of wrong matches at source.

**B. Direct LinkedIn URL Guessing**
Before any Firecrawl calls, construct candidate URLs from rationalization slugs (`linkedin.com/in/firstname-lastname`, `linkedin.com/in/flastname`, etc.) and try to scrape them. If any returns a valid profile with matching company, accept immediately. Cost: 0 search API calls, just 1-3 scrape attempts.

**C. Serper Fallback Search**
When Firecrawl search returns 0 results, try the same query via Serper (Google Search API). You already have SERPER_API_KEY. Google often finds LinkedIn profiles that Firecrawl misses, especially for niche companies.

**D. Relax Single-Name Filter**
Allow single-name leads through if they have a company name AND a non-personal email. The rationalization step can still produce useful search queries for "Dante at XYZ Corp."

### Phase 2: Pipeline Hardening (Medium Effort)

**E. Store Search Metadata on Failed Leads**
Add a `linkedin_search_log` column (jsonb) to the leads table. Store: rationalization output, queries tried, reasons for failure. On retry, the agent can see what was already tried and skip those strategies.

**F. Auto-Continuation for Batch Runs**
When a batch finishes with `remaining > 0`, automatically invoke the next batch (up to a max of 3 chained runs = 15 leads). Show progress in the UI toast: "Found 4/5, 12 remaining — running next batch..."

**G. Verify-Then-Re-Search Pipeline**
After `verify-linkedin-matches` clears a wrong match, automatically queue those leads for re-search in the same invocation. One button press: verify all → clear wrong → re-search cleared → done.

**H. Confidence-Tiered Agent Strategy**
Based on rationalization confidence, choose different search depths:
- **High confidence** (common name, clear company, matching email domain): Quick-match only, skip full agent → saves API calls
- **Medium confidence**: Full agent with 7 turns
- **Low confidence** (unusual name, no company, personal email): Full agent with gpt-4o and 10 turns (invest more in hard cases)

### Phase 3: Advanced (Higher Effort, Highest Accuracy)

**I. Cross-Lead Intelligence**
When you find a LinkedIn profile for one person at a company, use that company's LinkedIn page to find OTHER leads at the same company. If you have 3 leads at "Right Lane Industries" and find one, scrape the company page to find the others.

**J. Domain-to-Company Resolver**
Build a small lookup: when `email_domain` → known company LinkedIn page. Cache this mapping. For future leads from the same domain, skip the company search and go straight to the employee list.

**K. Manual Override UI**
In the Deal Room, add a "Paste LinkedIn URL" input field. When a user manually pastes a URL, run verification + enrichment (title, seniority, M&A) automatically. For the truly hard cases, let a human solve it in 5 seconds.

## Implementation Plan

### Step 1: Inline Verification + Direct URL Guessing + Serper Fallback
Modify `backfill-linkedin/index.ts`:
- Add `inlineVerify()` function (lightweight version of verify-linkedin-matches logic)
- Add `tryDirectSlugGuess()` before pre-search strategies
- Add `serperSearch()` fallback when Firecrawl returns empty
- Relax single-name filter to allow leads with company+email

### Step 2: Store Search Metadata
Database migration: Add `linkedin_search_log` jsonb column to leads table. Update `processLead()` to write rationalization + failure reasons.

### Step 3: Auto-Continuation + Verify-Re-Search
Update `backfill-linkedin` batch mode to chain runs. Update `verify-linkedin-matches` to trigger re-search on cleared leads.

### Step 4: Manual Override UI
Add a simple text input in the Deal Room LinkedIn section for manual URL paste, wired to the existing enrichment logic.

### Step 5: Cross-Lead Intelligence
Add company LinkedIn page caching. When processing batch, group leads by company and share discovered company pages.

## Expected Impact

| Improvement | Est. Hit Rate Gain | API Cost Impact |
|---|---|---|
| Inline verification | Eliminates wrong matches | Neutral (1 extra AI call) |
| Direct URL guessing | +5-10% finds | Saves searches |
| Serper fallback | +5-8% finds | ~$0.001/query |
| Relax single-name | +2-3% coverage | Minimal |
| Search metadata | Better retries | Neutral |
| Cross-lead intelligence | +3-5% finds | Saves searches |
| Manual override UI | Catches 100% of remainder | Zero |

**Combined estimate**: From current ~70% to ~90-95% automated, with manual override covering the remaining 5-10%. The only leads left unfound would be people who genuinely don't have LinkedIn profiles.

## Files to Change
- `supabase/functions/backfill-linkedin/index.ts` — Inline verify, direct slug guess, Serper fallback, relaxed name filter, search log writes, auto-continuation
- `supabase/functions/verify-linkedin-matches/index.ts` — Add re-search trigger after clearing
- `src/pages/DealRoom.tsx` — Manual LinkedIn URL paste input
- Database migration — Add `linkedin_search_log` jsonb column to leads

