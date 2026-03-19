

# AI-Driven LinkedIn Discovery — V2 with Scrape Tool + Pro Retry

## Architecture

### `backfill-linkedin/index.ts` — AI Search Agent (Primary)
- **Pass 1**: Gemini 2.5 Flash, 5 turns per lead, 3 tools: `search`, `scrape`, `found`/`give_up`
- **Pass 2**: Failed leads retried with Gemini 2.5 Pro, 8 turns (skips obvious junk)
- The `scrape` tool lets the agent read specific URLs (company team pages, LinkedIn company pages, etc.)

### `backfill-linkedin-website/index.ts` — Website Crawler (Complementary)  
- Step 1: Firecrawl Map to discover LinkedIn URLs on company sites
- Step 2 (NEW): If Map finds nothing, scrapes `/about`, `/team`, `/our-team`, `/leadership`, `/people` pages and extracts LinkedIn links from markdown + link arrays
- AI verification of matches

### Tools Available to the Agent
1. **search** — Firecrawl web search (broad queries)
2. **scrape** — Firecrawl scrape of a specific URL (team pages, LinkedIn company pages, profile verification)
3. **found** / **give_up** — Terminal actions

### Cost & Performance
- Pass 1 (Flash): Fast, cheap, catches ~60-70% of leads
- Pass 2 (Pro): Stronger reasoning for remaining ~30%, 8 turns max
- Website function: Complementary pass for leads with company URLs
- Failed leads reset to NULL for reprocessing between passes
