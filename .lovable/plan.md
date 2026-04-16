

# LinkedIn Enrichment: Phase 2+3 — Remaining Improvements for 99% Discovery

## Already Implemented (Full Audit)

| Capability | Status |
|---|---|
| AI Rationalization (nickname expansion, email inference, company normalization) | Done |
| Direct LinkedIn slug guessing from rationalization | Done |
| Inline verification on ALL paths (quick-match, agent, direct slug) | Done |
| Serper (Google) fallback at quick-match + agent give-up + agent search empty | Done |
| Relaxed single-name filter (allows single names with company+email) | Done |
| Search metadata persistence (`linkedin_search_log` jsonb) | Done |
| Previous search log injection on retry | Done |
| Verify-then-re-search pipeline (`verify-linkedin-matches` with `re_search`) | Done |
| Manual LinkedIn URL paste in Deal Room | Done |
| 3 pre-search strategies (company LinkedIn page, email initials, company website) | Done |
| Firecrawl v2 endpoints | Done |
| Firecrawl 429 retry logic | Done |
| Agent deduplication instruction (lists pre-search queries done) | Done |
| Email signature LinkedIn URL mining | Done |

## What's Still Missing

### D. Company-Level Search Cache Within a Batch
Currently, 3 leads at "Right Lane Industries" each independently search for the company LinkedIn page and scrape the company website — 3x the same expensive API calls. An in-memory `Map<companyDomain, { linkedinPage, websiteLinks }>` passed through the batch loop would eliminate this.

### E. Increase Batch Size + Auto-Continuation
`MAX_LEADS_PER_RUN = 5` is too small. Bump to 10 and auto-chain up to 3 runs (30 leads per button press). The function already counts `remaining` — just needs to self-invoke when `remaining > 0`.

### H. Cross-Lead LinkedIn Page Mining
When Strategy A finds a company LinkedIn page and scrapes employee profiles, match ALL extracted `/in/` slugs against other leads from the same company in the DB. One scrape resolves multiple leads simultaneously.

### I. Fuzzy Company Matching in Quick-Match
Quick-match currently requires exact substring match of company name in snippet. Add fuzzy matching: normalize both sides (strip "Inc", "LLC", "Corp", lowercase), try word-level overlap (2+ shared words = match). Catches "Right Lane" matching "Right Lane Industries LLC".

### K. Batch Progress via Realtime
During batch processing, broadcast progress to a Supabase realtime channel. The UI subscribes and shows live updates: "Processing 3/10 — Found: Woody Cissel, Searching: Ramesh Dorairajan..."

### L. "Re-search" Button in Deal Room
Next to the manual LinkedIn paste input, add a "Search Again" button that triggers single-lead mode with `gpt-4o` and 8 turns for leads previously not found. Currently you can only paste manually.

### M. LinkedIn Coverage Stats
Show enrichment coverage somewhere visible: "LinkedIn: 87/102 (85%)" with found/not-found/wrong breakdown.

## Implementation Plan

### Step 1: Company cache + batch scaling (`backfill-linkedin/index.ts`)
- Add `companyCache: Map<string, { linkedinPage?: string, websiteLinks?: string[] }>` parameter to `processLead`
- In Strategy A, check cache before searching; write results to cache after
- In Strategy C, check cache before scraping; write results to cache after
- Bump `MAX_LEADS_PER_RUN` from 5 → 10
- After batch completes with `remaining > 0`, self-invoke up to 2 more times (max 30 leads total)

### Step 2: Cross-lead mining (`backfill-linkedin/index.ts`)
- After Strategy A scrapes a company LinkedIn page and extracts `/in/` slugs, query the DB for other leads from the same company that still need LinkedIn
- For each match (slug contains firstName or lastName), write the URL directly with inline verification
- Track cross-resolved leads in the batch stats

### Step 3: Fuzzy company matching (`backfill-linkedin/index.ts`)
- Add `normalizeCompanyName(name)` — strips suffixes (Inc, LLC, Corp, Ltd, Group, Holdings), lowercases, trims
- In quick-match, use normalized comparison + word-overlap scoring instead of raw `includes()`
- Threshold: 2+ shared words OR normalized exact match

### Step 4: Re-search button + progress UI
- `src/pages/DealRoom.tsx`: Add "Search Again" button next to the LinkedIn override input, calling `backfill-linkedin` with `{ leadId, retryFailed: true }` (resets `linkedin_url` to null first)
- `src/components/LeadsTable.tsx`: Subscribe to a realtime channel during batch enrichment to show live progress toasts

### Step 5: Coverage stats
- `src/components/LeadsTable.tsx` or `Dashboard.tsx`: Query leads table for counts of `linkedin_url IS NOT NULL AND != ''` vs total, display as a small stat badge

## Files to Change

| File | Changes |
|---|---|
| `supabase/functions/backfill-linkedin/index.ts` | Company cache, batch auto-continuation, cross-lead mining, fuzzy company matching |
| `src/pages/DealRoom.tsx` | "Search Again" button |
| `src/components/LeadsTable.tsx` | Realtime progress subscription, coverage stats |

## Expected Impact

```text
Current estimated hit rate:  ~85-90%  (Phase 1 complete)
After company cache + batch:  ~90-93%  (more leads processed, fewer wasted API calls)
After cross-lead mining:      ~93-95%  (one scrape resolves multiple leads)
After fuzzy matching:          ~95-97%  (catches company name variations)
Manual override (Deal Room):   remaining 3-5%
Total coverage:                ~99%
```

