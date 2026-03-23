

# Fix: LinkedIn Discovery for Hard-to-Find Profiles

## Why It Failed

The agent's 5 searches all relied on **name + company** keywords. For Ellie Burei:
- LinkedIn slug `emb339` contains no name text — search engines won't match it to "Ellie Burei"
- LucaFah is a small firm, so there's minimal web presence linking her name to a LinkedIn URL
- The agent never tried **scraping the company's LinkedIn page** to find employees, despite having that strategy in the prompt

Two fixable issues:
1. **5 turns is too few** for hard cases — the agent ran out before trying company-LinkedIn-page scraping
2. **No company LinkedIn search** — the agent should proactively search for the company on LinkedIn and scrape its page to find employee links

## Plan

### 1. Increase single-lead retry turns from 5 to 8
**File**: `supabase/functions/backfill-linkedin/index.ts`

In the single-lead mode section, use 8 turns instead of `FLASH_MAX_TURNS` (5). This gives the agent enough room to try broader strategies after initial searches fail.

### 2. Add "company LinkedIn page" as a priority strategy in the prompt
**File**: `supabase/functions/backfill-linkedin/index.ts` — `buildSystemPrompt()`

Add an explicit high-priority strategy:
```
PRIORITY STRATEGY for small/niche companies:
- Search for the COMPANY on LinkedIn: "CompanyName site:linkedin.com/company"
- SCRAPE the company's LinkedIn page (linkedin.com/company/companyname/people or /about)
- Look for the person's name in the employee list or "people" section
- This is especially important when direct name searches fail
```

### 3. Add email-username inference strategy
The email `ellie.burei@lucafah.com` → initials could be "eb" or "emb". Add a prompt hint:
```
- If the person's email is firstname.lastname@domain, try searching for their initials 
  as a LinkedIn slug (e.g., ellie.burei → "emb" or "eb") combined with the company name
```

### 4. Use gpt-4o for retry/failed leads instead of gpt-4o-mini
When processing a single lead (retry mode), use `gpt-4o` for better reasoning about creative search strategies. Keep `gpt-4o-mini` for batch mode to control costs.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/backfill-linkedin/index.ts` | Enhanced prompt strategies, 8 turns for single-lead, gpt-4o for retries |

