
# LinkedIn Enrichment — Firecrawl Migration

## History
1. **v1**: Serper-based search, blind trust of first result → ~30% wrong matches
2. **v2**: Added AI verification on all candidates → 69 verified matches, ~95% accuracy
3. **v3 (current)**: Replaced Serper with Firecrawl Search + scraping for rich profile data

## Current Implementation (v3)

### Engine: Firecrawl Search API
- Replaces Serper (out of credits)
- Returns full markdown content from each LinkedIn result (not just 150-char snippets)
- AI verifier reads actual profile text: headline, about section, experience history

### Search Strategy (3-pass)
1. `site:linkedin.com/in "Name" "Company"` — with scrape
2. `site:linkedin.com/in "Name" "email-domain"` — with scrape
3. `site:linkedin.com/in "Name"` — broader, with scrape

### AI Verification
- Gemini 2.5 Flash reads full profile markdown (up to 1500 chars per candidate)
- Checks: name match, current company, URL slug, industry alignment with lead's submission message
- Picks best match or rejects all candidates

### Scoring
- Extracts title from rich profile content
- Detects M&A experience from full career history
- Updates seniority_score and stage2_score

## Status
| Category | Count |
|----------|-------|
| AI-verified correct (v2) | 69 |
| Searched, not found (v2) | 117 |
| Never searched | 5 |
| **Total** | **191** |

## Next Steps
- Run v3 backfill for unmatched leads (reset linkedin_url to NULL first if re-searching)
- Re-verify existing 69 matches by scraping their URLs with Firecrawl

## Files
- `supabase/functions/backfill-linkedin/index.ts` — Firecrawl-based search + AI verification
- `supabase/functions/verify-linkedin-matches/index.ts` — Existing match auditor
