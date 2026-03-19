

# Deeper LinkedIn Discovery — New Techniques for the Remaining 75

## First: Save Michael Tindall's LinkedIn
Directly update `Michael Tindall` with the URL you provided: `https://www.linkedin.com/in/michael-t-661bmt/`

## Analysis of Why Current Approach Fails

Looking at the 75 unmatched leads, the current 6-pass search strategy fails because:

1. **Company names are concatenated junk** — "Treatyoakequity", "Smartassistanthub", "Oiioholding" — these don't match how companies appear on LinkedIn
2. **Slugs don't contain full names** — Michael Tindall's slug is `michael-t-661bmt`, no "tindall" at all
3. **`site:linkedin.com/in` is too restrictive** — Firecrawl search with site: filters sometimes returns zero results for small companies
4. **Company website scraper only checks slug match** — `nameMatchesSlug()` requires both first AND last name in the URL slug, missing cases like `michael-t-661bmt`

## New Techniques to Add

### Technique 1: Firecrawl Map on Company Websites
Use the `/v1/map` endpoint instead of scraping individual pages. Map discovers ALL URLs on a site (up to 5000) in one fast call, including LinkedIn links in footers, team pages, about pages. Much more thorough than the current approach of trying 8 specific paths.

~50 of the 75 leads have a real `website_url` — this alone could find 10-20 more.

### Technique 2: Search Without `site:` Restriction
Add a pass: `"Person Name" "Company Name" linkedin` (no `site:linkedin.com`). This catches:
- Blog posts mentioning the person with a LinkedIn link
- Press releases, conference speaker pages
- Company websites linking to the person's LinkedIn
- Third-party directories

### Technique 3: Email Domain as Company Name
Many company names in our data are garbage (concatenated URLs). But the **email domain** is often cleaner. For `williams@treatyoakequity.com`, search `"Ben Williams" "treaty oak equity" linkedin` by expanding the domain into words.

### Technique 4: Relax the Website Scraper's Name Matching
Current `backfill-linkedin-website` requires both first AND last name in the LinkedIn URL slug. Change it to use AI verification (same as the main backfill) — send any LinkedIn URL found on the company website to AI for matching against lead context.

### Technique 5: Common Nickname Mapping
Add a nickname dictionary (Michael→Mike, Robert→Bob, William→Bill, etc.) and try alternate first names in searches.

## Implementation

### File: `supabase/functions/backfill-linkedin/index.ts`
- Add **Pass 6**: Broad search without `site:` restriction — `"Name" "Company" linkedin`
- Add **Pass 7**: Email domain expanded as company name — `"Name" "treaty oak equity" site:linkedin.com/in`
- Add **nickname map** and try alternate first names in Pass 0 and Pass 3
- Add **Firecrawl Map pass**: For leads with `website_url`, call `/v1/map` to discover LinkedIn URLs, then AI-verify

### File: `supabase/functions/backfill-linkedin-website/index.ts`
- Replace `nameMatchesSlug()` with AI-powered verification (call Lovable AI gateway like the main backfill does)
- Use Firecrawl Map instead of scraping 8 individual page paths
- This catches profiles like `michael-t-661bmt` that don't contain the full name

### Database: Direct update for Michael Tindall
```sql
UPDATE leads SET linkedin_url = 'https://www.linkedin.com/in/michael-t-661bmt/' WHERE name = 'Michael Tindall';
```

## Expected Impact
- Firecrawl Map on ~50 websites: **5-15 new matches**
- Broad non-site-restricted search: **5-10 new matches**
- Email domain expansion: **3-8 new matches**
- Nickname mapping: **2-5 new matches**
- Relaxed website scraper: **3-8 new matches**
- Combined (with overlap): **15-30 more matches**, bringing total from 111 to ~130-140 out of 191

