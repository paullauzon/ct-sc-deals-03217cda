

# Fix: LinkedIn Profile Verification When Scraping Fails

## Root Cause

The agent **found** `linkedin.com/in/emb339` on Turn 4 but couldn't verify it because:

1. **LinkedIn blocks Firecrawl scraping** (403 error) — the agent got "(empty page)" and moved on
2. **Email initials logic is wrong** — code generates "eb" and "elb" but never "emb" (first + middle + last initial). The slug `emb339` would only match if we tried middle-initial combinations.

## Fix Plan

### 1. Auto-verify LinkedIn URLs via search fallback when scrape fails
**File**: `supabase/functions/backfill-linkedin/index.ts` — scrape handler (lines 322-331)

When the agent scrapes a `linkedin.com/in/` URL and gets an empty response (403), automatically run a **search-based verification** instead of returning "(empty page)":
- Search for the LinkedIn slug (e.g., `"emb339" site:linkedin.com`)  
- Return the search snippet (which often contains name + headline) to the agent
- This lets the agent verify without needing to scrape the blocked page

```
// Pseudocode for the fallback:
if (parsed.url.includes("linkedin.com/in/") && scraped === "") {
  const slug = parsed.url.split("/in/")[1]?.split("/")[0];
  const fallbackResults = await firecrawlSearch(`"${slug}" site:linkedin.com`, ...);
  // Return snippet to agent instead of "(empty page)"
}
```

### 2. Fix email initials generation to include middle-initial variants
**File**: `supabase/functions/backfill-linkedin/index.ts` — lines 260-277

Current logic for `ellie.burei`:
- `initials2` = "eb" (correct)
- `initials3` = "elb" (wrong — takes first 2 chars of first name + first of last)

Fix: generate ALL reasonable initial combinations including single-letter initials with a middle letter between them. For "ellie.burei", generate: "eb", "emb", "elb", "eab", "ecb"... or more practically, just try all 26 middle-initial variants: `e[a-z]b`.

Simpler approach: generate the slug prefix patterns and search for them:
- "eb" (first+last initial)
- "e_b" pattern where _ is any letter (covers middle initials like "emb")
- The full local part "ellieburei" or "ellie-burei"

### 3. Add the LinkedIn URL directly to pre-search context when found on company website
When the pre-search scrapes the company website (lucafah.com) and finds a LinkedIn link, include it prominently so the agent tries to verify it immediately rather than searching from scratch.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/backfill-linkedin/index.ts` | Search-based fallback for 403'd LinkedIn scrapes; fix initials generation; enhance pre-search LinkedIn link handling |

## Expected Result
The agent will: find `emb339` on lucafah.com → try to scrape it → get 403 → auto-search for the slug → get snippet showing "Ellie Burei" → verify match → report found.

