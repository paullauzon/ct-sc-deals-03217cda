

# Get Maximum LinkedIn Coverage (91 → ~145+)

## Strategy Overview

Three complementary approaches, executed in order of impact:

### Phase 1: Fix & Re-deploy the Backfill (quick win, +10-20 matches)

The codebase still has the OLD backfill logic (Pass 2 without company validation). The validation code from the approved plan needs to be properly written into the file with all 3 passes:
- Pass 1: Name + Company (trust Google)
- Pass 2: Name + Email domain hint (new)  
- Pass 3: Name only WITH company validation (reject if no match)

Also loosen the validation: currently checking exact substring. Add fuzzy matching — e.g. "Imperialcap" should match "Imperial Capital", "treatyoakequity" should match "Treaty Oak Equity".

**Files**: `supabase/functions/backfill-linkedin/index.ts`, `supabase/functions/enrich-lead-scoring/index.ts`

### Phase 2: Scrape Company Websites for LinkedIn Links (+15-25 matches)

37 leads have `company_url`. Many company websites have /about or /team pages with direct LinkedIn profile links. Use the existing Firecrawl connector to:
1. Crawl `company_url` + common team page paths (`/about`, `/team`, `/about-us`, `/our-team`, `/leadership`)
2. Extract all `linkedin.com/in/` URLs from the page
3. Match by name (first name + last name appearing in nearby text or the LinkedIn URL slug)
4. Write matches to the DB

**Files**: New edge function `supabase/functions/backfill-linkedin-website/index.ts`

### Phase 3: AI-Powered Fuzzy Lookup (+5-10 matches)

For remaining unmatched leads with business emails, use Lovable AI gateway to:
1. Take the Serper search results (even ones that failed validation)
2. Ask AI: "Given person X at company Y with email Z, which of these LinkedIn profiles is most likely correct?"
3. AI can handle abbreviations, name variations, and company name mismatches

This is added as a final pass in the main backfill function, not a separate function.

**Files**: `supabase/functions/backfill-linkedin/index.ts` (add Pass 4: AI arbitration)

### What Won't Match (~45-50 leads)

- ~10 spam/fake leads (mozmail, creteanu.com emails, gibberish names)
- ~10 people with no LinkedIn presence (small business owners, non-US)
- ~7 leads with no company AND personal email (nothing to validate against)
- Remainder: genuinely unfindable via public search

## Execution Order

1. Deploy Phase 1 (fixed backfill with fuzzy validation) → re-run
2. Deploy Phase 2 (website scraping) → run for leads still missing
3. Deploy Phase 3 (AI arbitration) → run for remaining stubborn cases

## Files Changed
- `supabase/functions/backfill-linkedin/index.ts` — Rewrite with proper 3-pass + fuzzy validation + AI pass
- `supabase/functions/enrich-lead-scoring/index.ts` — Mirror the improved lookup logic
- `supabase/functions/backfill-linkedin-website/index.ts` — New function: scrape company websites via Firecrawl

## Technical Details

**Fuzzy company matching**: Split company name into words, check if 2+ words appear in snippet. Also normalize by removing spaces/hyphens ("treatyoakequity" → ["treaty", "oak", "equity"]).

**Firecrawl website scraping**: Use existing `FIRECRAWL_API_KEY` connector. Scrape with `formats: ['links']` to get all URLs, then filter for `linkedin.com/in/`. Match against lead name by checking if the URL slug contains parts of the name (e.g., `/in/abigail-gupta` matches "Abigail Gupta").

**AI arbitration**: Call Lovable AI gateway with a structured prompt: "Person: {name}, Company: {company}, Email: {email}. LinkedIn candidates: [urls + snippets]. Which profile belongs to this person? Return the URL or null." Use `google/gemini-2.5-flash` for speed.

