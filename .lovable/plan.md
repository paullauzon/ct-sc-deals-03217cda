

# Investigation: LinkedIn Backfill Status & Gaps

## Current State
- **89/191 leads matched** (47%) — 102 still missing
- The `backfill-linkedin` function (3-pass + AI arbitration) ran and completed
- The `backfill-linkedin-website` function (Firecrawl scraping) was **never run**
- Of the 102 unmatched: 80 have business emails, 13 personal emails, 7 no company, 2 spam

## Issues Found

### 1. Website backfill never executed
Phase 2 (Firecrawl website scraping) was deployed but never triggered. ~50 of the missing leads have `company_url` values — this could yield 5-15 more matches.

### 2. Pass 1 query is too strict for weird company names
Many companies are stored as domain-style names: "Imperialcap", "Treatyoakequity", "Threadlinepartners". Pass 1 searches `"Imperialcap"` which won't match LinkedIn snippets that say "Imperial Capital". The `cleanCompanyName` function strips suffixes but doesn't split concatenated names. The fuzzy `tokenize` function exists but is only used in `isCompanyMatch` (Pass 3 validation), not in the actual search query construction.

### 3. Pass 1 should also try the cleaned/expanded company name
For "Imperialcap" → search should try `"Imperial Capital"` or at minimum `"Imperial"`. Currently it searches the raw company name.

### 4. Some leads have LinkedIn URLs as their `company_url` 
E.g. David Frankel has `company_url: https://www.linkedin.com/in/david-frankel/` and Jared L Curtis has a company LinkedIn URL. These are free matches — just extract the profile URL directly.

### 5. AI arbitration may not fire for all cases
If Pass 3 name-only search returns 0 results (not just 0 validated), there are no candidates for AI. Some very niche names may need different search strategies (e.g., without quotes around name).

### 6. Single-name leads ("Jakub", "Jama", "PAWEL") 
These can't be found on LinkedIn reliably — expected failures.

## Plan: Maximize Matches

### Step 1: Quick wins — extract LinkedIn from company_url field
Some leads already have LinkedIn profile URLs stored in `company_url`. Just move them to `linkedin_url`.

### Step 2: Improve Pass 1 search query construction
- Split concatenated domain-style company names: "Imperialcap" → "Imperial Cap" → search `"Imperial"`
- Try the email domain as an additional search variant in Pass 1 (not just Pass 2)
- For Pass 1, also try with just the first significant word of the company

### Step 3: Run the website backfill
Deploy and trigger `backfill-linkedin-website` for leads with company URLs.

### Step 4: Add a Pass 0 — direct LinkedIn search by email domain
Before the 3-pass Serper search, try: `site:linkedin.com/in/ "firstname" "lastname" site-keyword`. For business email domains that exactly match a known company, this is very high-signal.

### Step 5: Loosen Pass 3 name-only search
- Try without quotes around name for uncommon names
- Check more than 5 results (increase `num` to 10)

## Files Changed
- `supabase/functions/backfill-linkedin/index.ts` — Improve query construction, add LinkedIn-from-company-url extraction, loosen search
- `supabase/functions/enrich-lead-scoring/index.ts` — Mirror improvements

## Expected Outcome
- Quick wins from company_url LinkedIn extraction: +2-3
- Improved search queries: +10-20
- Website scraping: +5-15  
- Total: **89 → ~110-125 matches**
- Remaining ~65-80 are genuinely unfindable (niche businesses, non-English names, no LinkedIn presence, spam)

