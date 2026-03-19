

# Run Full LinkedIn Backfill

## Current State
- **69 matched** (have linkedin_url with actual URL)
- **117 searched-not-found** (linkedin_url = '' empty string)  
- **5 never searched** (linkedin_url IS NULL)

## Problem
The backfill function only processes leads where `linkedin_url IS NULL`. The 117 previously-failed leads have `linkedin_url = ''`, so they'll be skipped. We need to reset them first.

## Execution Steps

### Step 1: Reset 117 failed leads to NULL
Run a database migration to set `linkedin_url = NULL` where it's currently an empty string. This makes them eligible for the new Firecrawl-powered search.

```sql
UPDATE leads SET linkedin_url = NULL WHERE linkedin_url = '';
```

### Step 2: Run backfill-linkedin repeatedly
The function has a 150s timeout and processes 3 leads per batch with delays. With ~122 leads to process, we'll need **4-6 invocations**. Each run picks up remaining NULL leads.

### Step 3: Run backfill-linkedin-website
For any still-unmatched leads that have `company_url`, try scraping company websites for team page LinkedIn links.

### Step 4: Final status check
Query the database to report final match rate and list truly unfindable leads.

## Cost
- Firecrawl credits (not Serper) for search + scrape
- Free AI calls via Lovable gateway for verification
- No Serper credits needed

## Files Changed
None — just executing existing deployed functions and one data reset.

