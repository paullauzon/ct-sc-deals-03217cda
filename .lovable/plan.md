

# Strategy: Replace Serper with Firecrawl Search for LinkedIn Matching

## Current Status
- **69 matched** / 191 total (36%)
- **122 unmatched** (117 searched-not-found + 5 never searched)
- **0 Serper credits remaining** — cannot run current backfill

## The Problem with Serper
Serper is a Google Search API. It returns 10 blue links with short snippets (~150 chars). The snippets contain very little context about the person — often just their name and a vague title. This forces AI to guess based on minimal info.

## Better Approach: Firecrawl Search

Firecrawl is already connected to this project. Its **search** endpoint can replace Serper entirely:
- Web search with optional **content scraping** from each result
- Returns full markdown content from each result page, not just a snippet
- This means the AI verifier gets the actual LinkedIn profile text (headline, about section, experience) instead of a 150-char Google snippet

### Why This Is Dramatically Better

| Factor | Serper (current) | Firecrawl Search |
|--------|-----------------|------------------|
| Result info | ~150 char snippet | Full page markdown |
| AI verification quality | Guessing from title + company mention | Reading actual LinkedIn profile content |
| Company matching | Often ambiguous | Can see full experience history |
| Cost | Out of credits | Already connected, has credits |

### Strategy

1. **Replace Serper calls with Firecrawl search** in `backfill-linkedin`
   - Use `firecrawl search` with query like `site:linkedin.com/in "FirstName LastName" "Company"`
   - Enable `scrapeOptions: { formats: ['markdown'] }` to get full profile content from top results
   - This gives AI the actual LinkedIn profile text to verify against

2. **Enhance AI verification prompt** — with full profile markdown, the AI can check:
   - Current company in Experience section
   - Job title matches role/industry from lead's message
   - Location matches geography field
   - Career history aligns with buyer type (e.g., M&A, corp dev)

3. **Re-run for all 122 unmatched leads** — fresh search with better data quality

4. **Re-verify the 69 existing matches** — scrape each `linkedin_url` with Firecrawl to get full profile, then AI-verify against lead context. This catches remaining bad matches that slipped through snippet-based verification.

## Implementation

### Files Changed
- **`supabase/functions/backfill-linkedin/index.ts`** — Replace all `serperSearch()` calls with Firecrawl search API calls. Update `collectAllCandidates` to return full markdown content per candidate. Update `aiPickBestCandidate` prompt to use rich profile data.

### Search Query Strategy (unchanged logic, new engine)
- Pass 1: `site:linkedin.com/in "Name" "Company"` (with scrape)
- Pass 2: `site:linkedin.com/in "Name" "email-domain"` (with scrape)  
- Pass 3: `site:linkedin.com/in "Name"` (with scrape, broader)

### Cost Estimate
- Firecrawl search: ~122 leads × 2-3 searches = ~300 search calls
- Each search with scrape uses more credits than plain search
- Check Firecrawl credit balance before running

### Expected Outcome
- **Much higher accuracy** — AI sees full profiles, not snippets
- **More matches** — better search results from Firecrawl
- Estimated: **90-110 verified matches** out of 191 (up from 69)

