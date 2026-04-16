

# Smart LinkedIn Rationalization — AI-First Strategy Before Search

## Problem
The current system jumps straight into expensive Firecrawl searches with the raw lead name. For "Woody Cissel" at Right Lane Industries, it never thinks to search "William Cissel" — even though any human would immediately recognize "Woody" as a nickname for William, and the email `wcissel@` confirms the W initial. The agent burns 5 turns and gives up.

## Solution: Add a Pre-Search "Rationalization" Step
Before any Firecrawl API calls, call OpenAI to analyze all available lead data and produce a structured search plan. This is cheap (one GPT-4o-mini call, ~200 tokens out) and dramatically improves hit rate.

### What the Rationalization Produces
A JSON object with:

```text
{
  "name_variants": ["William Cissel", "Woodrow Cissel", "W Cissel"],
  "company_variants": ["Right Lane Industries", "Right Lane Industrial", "RLI"],
  "email_inference": { "first_initial": "w", "likely_names": ["William", "Walter", "Warren"] },
  "linkedin_slug_guesses": ["williamcissel", "wcissel", "woody-cissel"],
  "best_search_query": "\"William Cissel\" OR \"Woody Cissel\" \"Right Lane\" site:linkedin.com/in",
  "confidence_notes": "Woody is almost certainly a nickname for William. Email wcissel@ confirms W initial and Cissel surname."
}
```

### Rationalization Rules (baked into the prompt)
1. **Nickname expansion** — Map common nicknames to formal names AND vice versa (Woody→William/Woodrow, Bill→William, Bob→Robert, Dick→Richard, Ted→Edward/Theodore, Chuck→Charles, Jack→John, Jim→James, Mike→Michael, etc. — ~60 pairs)
2. **Email username analysis** — Extract first initial, last name guess, full username pattern. If email is `wcissel@`, infer W-names for someone named "Woody"
3. **Company name normalization** — Break concatenated names ("Treatyoakequity" → "Treaty Oak Equity"), expand abbreviations, try domain-derived names
4. **Domain cross-reference** — If email domain ≠ company URL domain, note the discrepancy as a signal
5. **Search query generation** — Produce 2-3 ranked search queries from most-to-least specific
6. **Confidence assessment** — Flag whether this is a straightforward lookup or a hard case

### How It Integrates
1. **Before** the pre-search strategies (A, B, C) and agent loop
2. The rationalization output gets injected into both:
   - The pre-search queries (replacing hardcoded name with best variants)
   - The agent's context (so it knows which name variants to try)
3. The first Firecrawl search uses `best_search_query` from rationalization — highest ROI
4. If that finds a match, we're done in 1 API call total (1 AI + 1 Firecrawl)

### Additional Improvements
- **Bump `FLASH_MAX_TURNS`** from 5 → 7 for batch mode to allow nickname resolution
- **Quick-match shortcut**: If the rationalization's `best_search_query` returns a LinkedIn result where the title/description contains the company name, auto-accept without entering the agent loop
- **Inject name variants into the agent system prompt** so it doesn't waste turns trying only the original name

## Files to Change
- `supabase/functions/backfill-linkedin/index.ts` — Add `rationalizeLead()` function, wire it before pre-search strategies, update agent context injection, bump FLASH_MAX_TURNS

## What This Does NOT Change
- Single-lead mode still uses gpt-4o with 8 turns (already strong)
- The verify-linkedin-matches function (separate, works fine)
- The post-match enrichment logic (title extraction, seniority scoring)

