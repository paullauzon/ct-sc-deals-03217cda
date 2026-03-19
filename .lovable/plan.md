

# Fix LinkedIn Profile Accuracy — Company Validation

## Problem
The current LinkedIn lookup finds the **first** profile matching the person's name, but doesn't verify it belongs to someone at the right company. Result: ~50% of matches are wrong people (e.g., "Adam Berman" at Savade Holdings matched to someone at Hendrick Automotive Group).

The root cause is **Pass 2** (name-only fallback) — when the company+name search fails, it searches just the name and picks the first LinkedIn profile it finds, which is often the wrong person.

## Solution: Add Company Validation

After finding a LinkedIn result, validate the snippet/title against known company signals before accepting the match. We have three signals: company name, email domain, and company URL domain.

### Validation Logic (both edge functions)
```
function isCompanyMatch(snippet, company, email, companyUrl):
  - Extract email domain (e.g., "savadeholdings.com" → "savade")
  - Extract company URL domain (e.g., "https://savadeholdings.com" → "savade") 
  - Clean company name (strip LLC/Inc/etc)
  - Check if snippet contains ANY of: company name, email domain root, URL domain root
  - For Pass 1 (searched with company): accept match (already filtered by Google)
  - For Pass 2 (name-only fallback): REQUIRE company validation to pass
  - If validation fails on Pass 2: reject the match (return null)
```

### Changes to Search Strategy
1. **Pass 1** (name + company): Keep as-is, trust Google's filtering
2. **Pass 2** (name only): Add company validation — check snippet contains company/domain reference. If not, **reject** the match rather than accepting the wrong person
3. **Pass 3** (new): Try with email domain as company hint: `site:linkedin.com/in/ "Name" "emaildomain"` — many company websites match email domains

### Backfill: Clear Bad Data + Re-run
1. Reset all `linkedin_url`, `linkedin_title`, `linkedin_ma_experience` to NULL for all leads
2. Re-run backfill with improved validation
3. This will reduce total matches somewhat (maybe 120-140 instead of 161) but accuracy will be dramatically higher

## Files Changed

### `supabase/functions/backfill-linkedin/index.ts`
- Update `serperLinkedInLookup` signature to accept `email` and `companyUrl` params
- Add `isCompanyMatch()` validation function
- Add Pass 3 (email domain search)
- Validate Pass 2 & 3 results against company signals
- Update the main loop to pass `email` and `companyUrl` to the lookup function
- Select `email` and `company_url` from the leads query

### `supabase/functions/enrich-lead-scoring/index.ts`
- Same validation logic changes to `serperLinkedInLookup`
- Add `isCompanyMatch()` function
- Add Pass 3 (email domain search)
- Pass email/companyUrl through from the lead data

### After deployment
- Clear all existing LinkedIn data (since ~50% is wrong)
- Re-run backfill with the validated logic

