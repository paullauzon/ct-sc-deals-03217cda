

# Optimizing LinkedIn Discovery — What's Working, What's Next

## Current State
- **126/191 matched** (66%), **65 not found**
- Architecture: AI agent (Gemini 2.5 Flash) with Firecrawl Search as its tool, up to 5 search turns per lead

## Analysis of the 65 Unmatched

Roughly 3 categories:
- **~12 junk/spam**: "a a", "Bexi Jam" (creteanu.com), "David Mathewd" (mozmail.com), single names (Jakub, Jama, Sahra, PAWEL), gmail-only with no company
- **~15 low-signal**: Generic email + vague company name, limited web presence (Zeld Alliance, Sampad Prudentia, Solaris Inc)
- **~38 real people at real companies** that the agent failed to find — these are the opportunity

## What Could Be Better

### 1. Add Perplexity as a Search Tool (High Impact)
You have Perplexity available as a connector. Perplexity is an **AI-native search engine** — it doesn't just return URLs, it reads and synthesizes results. For a query like "Ben Williams Treaty Oak Equity LinkedIn," Perplexity would reason through the results and potentially return the actual profile URL directly.

The AI agent currently uses Firecrawl Search, which is essentially a raw web search. Adding Perplexity as a **second search tool** the agent can choose between would give it a much stronger option for ambiguous queries.

### 2. Firecrawl Scrape on Team/About Pages (Medium Impact)
The website function uses Firecrawl **Map** (URL discovery) but never actually **scrapes** team pages. Many company sites embed LinkedIn links in JavaScript widgets, iframes, or non-standard HTML that Map won't capture. Adding a scrape step for `/about`, `/team`, `/our-team`, `/leadership` pages would catch these.

### 3. Upgrade Model for Hard Cases (Medium Impact)
Use `google/gemini-2.5-pro` instead of `flash` for leads that failed the first pass. Pro is significantly better at reasoning through complex search strategies and interpreting ambiguous results. Run flash first (cheap/fast), then retry failures with pro.

### 4. Increase Agent Turns for Retries (Low-Medium Impact)
Currently capped at 5 turns. For the hard cases on retry, bump to 8 turns — more room for the agent to pivot strategies and try creative approaches.

### 5. Firecrawl Scrape the LinkedIn Company Page (Medium Impact)
Instead of just searching `"Company" site:linkedin.com/in`, actually **scrape** the company's LinkedIn page. Company pages often list employees in the page content. The agent could request a scrape of `linkedin.com/company/treaty-oak-equity` and parse employee names from the returned markdown.

## Proposed Implementation

### Changes to `backfill-linkedin/index.ts`
1. Add Perplexity API call as a second tool the agent can use (`{"action": "perplexity", "query": "..."}`)
2. Add Firecrawl Scrape as a third tool (`{"action": "scrape", "url": "..."}`) for reading specific pages
3. Update system prompt to tell the agent about its new tools and when to use each
4. Add a **retry pass**: leads that failed with flash get retried with `gemini-2.5-pro` and 8 turns
5. Reset the 65 failed leads to NULL so they get reprocessed

### Changes to `backfill-linkedin-website/index.ts`
1. After Map discovers no LinkedIn URLs, scrape team/about pages directly and extract LinkedIn links from markdown content

### New secret needed
- Perplexity API key via the Perplexity connector

### Cost estimate
- ~38 real leads × ~5 Perplexity calls = ~190 Perplexity queries
- ~38 leads × additional Firecrawl scrapes = ~100 Firecrawl credits
- AI calls free via Lovable gateway
- Expected: **15-25 more matches**, bringing total to ~140-150/191

