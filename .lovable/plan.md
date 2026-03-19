

# Smarter LinkedIn Discovery — Company-First Search Strategy

## The Insight

Your manual process works: **search company → find company LinkedIn page → browse employees → match person**. The current code only does `"Person Name" "Company" site:linkedin.com/in` which fails when:
- The company is small and employees don't appear in Google results for that query
- The person uses a nickname or shortened name on LinkedIn (e.g. "Michael T." slug `michael-t-661bmt`)
- The company name on LinkedIn differs from what's in our data

## New Search Strategy (4 passes instead of 3)

### Pass 0 (NEW): Company-First Employee Discovery
1. Search `"Company Name" site:linkedin.com/company` → find company LinkedIn page
2. Use Firecrawl to scrape the company page — LinkedIn company pages often list key employees in the page content/metadata
3. Also search `"Company Name" site:linkedin.com/in` (without the person's name) → returns all employees of that company on LinkedIn
4. Filter results by **first name** match (relaxed — just first name, not full name) to find candidates

This is exactly your workflow automated. For Michael Tindall at Modern Distribution: searching `"Modern Distribution" site:linkedin.com/in` would surface employees, and filtering for "Michael" finds him.

### Pass 1: Name + Company (existing, kept)
`"Michael Tindall" "Modern Distribution" site:linkedin.com/in`

### Pass 2: Name + Email domain (existing, kept)
`"Michael Tindall" "moderndistributionnc" site:linkedin.com/in`

### Pass 3: First name only + Company (NEW relaxed variant)
`"Michael" "Modern Distribution" site:linkedin.com/in` — catches nickname/shortened name profiles

### Pass 4: Name only (existing fallback)
`"Michael Tindall" site:linkedin.com/in`

All candidates from all passes go to AI verification as before.

## Additional Improvements

**Company website scraping (enhanced)**: For the 65 leads with `website_url`, scrape team/about/leadership pages with Firecrawl to find LinkedIn links. The existing `backfill-linkedin-website` function already does this but could run more aggressively (more page paths, follow links deeper).

**Email address direct search**: Try `"michael@moderndistributionnc.com" site:linkedin.com` — sometimes email addresses are indexed on LinkedIn profiles.

## Implementation

### File: `supabase/functions/backfill-linkedin/index.ts`
- Add new `Pass 0: Company-first employee discovery` in `collectAllCandidates()`
- Add new `Pass 3: First name + Company` relaxed search
- Add email address direct search as an additional pass
- Keep all existing passes intact, just add new ones before the AI verification step

### Cost Estimate
- ~83 unmatched leads × ~5 searches each = ~415 Firecrawl search calls
- Some with scrape enabled (Pass 0 company pages) = moderate credit usage
- ~83 AI verification calls (free via Lovable gateway)

### Expected Outcome
With 5 search strategies instead of 3, and the company-first approach matching your manual workflow, we should find LinkedIn profiles for **30-50 more leads** out of the 83 currently unmatched.

