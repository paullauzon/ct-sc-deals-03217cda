

# LinkedIn Enrichment: 99% Discovery — Strategic Deep Dive

## Current State (What's Already Implemented)

| Capability | Status |
|---|---|
| AI Rationalization (nickname expansion, email inference, company normalization) | Done |
| Direct LinkedIn slug guessing from rationalization | Done |
| Inline verification (GPT-4o-mini check before DB write) | Done |
| Serper (Google) fallback when Firecrawl returns 0 | Done |
| Relaxed single-name filter (allows single names with company+email) | Done |
| Search metadata persistence (`linkedin_search_log` jsonb) | Done |
| Verify-then-re-search pipeline (`verify-linkedin-matches` with `re_search`) | Done |
| Manual LinkedIn URL paste in Deal Room | Done |
| 3 pre-search strategies (company LinkedIn page, email initials, company website) | Done |

## Gap Analysis: What's Still Missing

### 1. Quick-Match Verification Gap
The quick-match shortcut (lines 428-480) auto-accepts results when company+lastName appear in the snippet — but it **skips inline verification**. This is the one path where a wrong match can still slip through. The agent path verifies, the direct slug path verifies, but quick-match does not.

### 2. No Firecrawl v2 Migration
The function still uses Firecrawl v1 endpoint (`/v1/search`, `/v1/scrape`). The v2 API has better search quality and reliability.

### 3. Agent Doesn't Know What Was Already Tried
The pre-search strategies (A, B, C) run programmatically and inject results into the agent's context. But if the agent then repeats the exact same searches, it wastes turns. The agent prompt doesn't explicitly say "these searches were already done, don't repeat them."

### 4. No Company-Level Caching Across Leads
If you have 3 leads at "Right Lane Industries", each one independently searches for the company LinkedIn page, scrapes the company website, etc. The same expensive API calls are made 3 times.

### 5. Batch Size Too Small
`MAX_LEADS_PER_RUN = 5` means clicking the button repeatedly for large backlogs. No auto-continuation.

### 6. Firecrawl Rate Limit Handling
No retry logic for 429s from Firecrawl. A single rate limit error kills the search for that lead.

### 7. No "Re-rationalize on Retry" Logic
When `retryFailed=true` re-processes a lead, it starts fresh rationalization. But it doesn't read the previous `linkedin_search_log` to see what was already tried — so it may repeat identical failing strategies.

### 8. LinkedIn URL Extraction from Email Signatures
Many business emails contain LinkedIn profile URLs in the signature. The `lead_emails` table has `body_preview` — this data is never mined for LinkedIn URLs.

### 9. No Batch Progress Feedback
The UI shows a single toast ("LinkedIn enrichment started") and then silence until completion. For 5 leads at ~30 seconds each, that's 2.5 minutes of no feedback.

## Improvement Plan (Ranked by Impact)

### Tier 1: Immediate Accuracy Wins

**A. Add inline verification to quick-match path**
The quick-match at lines 428-480 currently auto-accepts. Add the same `inlineVerify()` call that the agent path uses. Cost: 1 extra GPT-4o-mini call per quick-match. Eliminates the last "wrong match" vector.

**B. Mine email signatures for LinkedIn URLs**
Query `lead_emails` for each lead, scan `body_preview` for `linkedin.com/in/` URLs. If found, verify with `inlineVerify()` and accept. This is free — no search API calls needed. Many business professionals include their LinkedIn in their email signature.

**C. Read previous search log on retry**
When processing a lead that has an existing `linkedin_search_log`, inject the previous failure reason and queries tried into the agent context. The agent can then avoid repeating failed strategies and try new approaches.

### Tier 2: Efficiency & Scale

**D. Company-level search cache within a batch**
During a batch run, maintain an in-memory map of `company → { linkedinPage, websiteLinks }`. When the second lead from the same company is processed, skip strategies A and C (company LinkedIn page scrape, company website scrape) and reuse cached results. Saves 2-4 API calls per duplicate company.

**E. Increase batch size + auto-continuation**
Bump `MAX_LEADS_PER_RUN` from 5 → 10. After a batch completes, if `remaining > 0`, automatically chain up to 2 more runs (max 30 leads per button press). Return cumulative stats.

**F. Add retry logic for Firecrawl 429s**
Wrap `firecrawlSearch` and `firecrawlScrape` with a simple retry (1 retry after 3s delay on 429). Prevents transient rate limits from causing false "not found" results.

**G. Migrate to Firecrawl v2 endpoints**
Change `/v1/search` → `/v2/search` and `/v1/scrape` → `/v2/scrape`. Better search quality, especially for LinkedIn queries.

### Tier 3: Advanced Intelligence

**H. Cross-lead LinkedIn page mining**
When a company LinkedIn `/people` page is found for one lead, extract ALL employee profile links and match them against other leads from the same company in the DB. One scrape can resolve multiple leads.

**I. "Confident skip" fast path**
When rationalization confidence is "high" AND the quick-match returns exactly 1 LinkedIn result AND inline verify says "correct" — skip the full agent loop entirely. Currently, if quick-match misses (e.g., company name is slightly different in snippet), the full agent loop runs. Add a second-chance quick-match with fuzzy company matching before entering the expensive agent loop.

**J. Agent deduplication instruction**
Add an explicit line to the agent system prompt: "The following searches were ALREADY performed by the pre-search system. Do NOT repeat them. Focus on NEW strategies." List the pre-search queries.

### Tier 4: UI & Workflow

**K. Batch progress via realtime channel**
During batch processing, write progress updates to a Supabase channel. The UI subscribes and shows: "Processing 3/10 — Found: Woody Cissel, Searching: Ramesh Dorairajan..."

**L. "Search Again" button in Deal Room**
Next to the manual LinkedIn paste input, add a "Re-search" button that triggers a single-lead re-search with `gpt-4o` and 10 turns for leads that were previously not found.

**M. Dashboard enrichment stats**
Show a small card: "LinkedIn Coverage: 87/102 leads (85%)" with a breakdown of found/not-found/wrong.

## Files to Change

| File | Changes |
|---|---|
| `supabase/functions/backfill-linkedin/index.ts` | A (quick-match verify), B (email signature mining), C (read previous log), D (company cache), E (auto-continuation), F (retry logic), G (v2 endpoints), H (cross-lead), I (confident skip), J (agent dedup) |
| `supabase/functions/verify-linkedin-matches/index.ts` | No changes needed |
| `src/pages/DealRoom.tsx` | L (re-search button) |
| `src/components/LeadsTable.tsx` | K (progress feedback) |

## Recommended Implementation Order

**Phase 1** (this session): A + B + C + F + G — accuracy hardening, no new UI
**Phase 2** (next session): D + E + J — efficiency at scale
**Phase 3** (future): H + I + K + L + M — advanced features and UI polish

## Expected Impact

```text
Current estimated hit rate:  ~75-80%
After Phase 1 (accuracy):   ~85-90%  (email signatures + retry fix + quick-match verify)
After Phase 2 (efficiency): ~90-93%  (company cache + more leads per run)
After Phase 3 (advanced):   ~93-97%  (cross-lead mining + fuzzy matching)
Manual override catches:     remaining 3-7%
Total coverage:              ~99%
```

The only leads genuinely left behind would be people who (a) don't have LinkedIn profiles, (b) use completely unrelated names, or (c) work at companies with zero web presence.

