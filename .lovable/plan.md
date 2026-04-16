

# Replace Serper with Firecrawl Search — Zero New Dependencies

## The Insight

You already have **Firecrawl Search** (`firecrawlSearch`) as the primary search engine in `backfill-linkedin`. Serper is only used as a fallback in 5 specific places. Since Firecrawl Search hits the same Google results via its own API, we can **eliminate the Serper dependency entirely** by routing all Serper calls through the existing `firecrawlSearch` function.

You already pay for Firecrawl. No new keys, no new costs, no new configuration.

## What Changes

There are exactly 5 places where `serperSearch()` is called:

1. **Quick-match fallback** (line ~695) — when primary Firecrawl search finds no LinkedIn results
2. **Strategy D role-filtered search** (line ~959) — `site:linkedin.com/in "Company" "Role"`
3. **Agent give-up Serper fallback** (line ~1068) — last-resort after agent exhausts turns
4. **Agent open web search** (line ~1082) — broad search without `site:` restriction
5. **Agent tool call Serper** (line ~1143) — when agent explicitly requests a search

All 5 use the same `SearchResult[]` interface that `firecrawlSearch` already returns. It's a drop-in replacement.

## Technical Details

### File: `supabase/functions/backfill-linkedin/index.ts`

- Replace all 5 `serperSearch(query, serperKey, limit)` calls with `firecrawlSearch(query, firecrawlKey, limit, false)` (the `false` skips full page scraping — we only need URLs and titles, same as Serper)
- Remove the `serperKey` parameter from `aiSearchAgent` and `processLead` signatures
- Remove the `SERPER_API_KEY` env read (line ~1464)
- Remove the `_serperExhausted` flag and `serperSearch` function entirely (lines 112-192)
- Keep the `isSerperExhausted` concept but rename to a generic `_searchExhausted` flag tied to Firecrawl 402/429 responses (already partially handled by `firecrawlFetchWithRetry`)

### What About Firecrawl Credits?

Firecrawl Search costs 1 credit per search. The 5 fallback points fire only when the primary search fails, so in practice this adds 1-3 extra searches per hard-to-find lead. For a batch of 30 leads, worst case ~90 extra credits. Firecrawl's free tier includes 500 credits/month; paid plans start at 3,000.

### Bonus: Firecrawl Search Returns Richer Data

Unlike Serper which returns title + snippet + URL, Firecrawl Search can optionally return full markdown content. This means the quick-match verification step gets more data to work with — potentially improving match accuracy on the same call.

## Summary

One file change. Remove ~80 lines of Serper code, replace 5 call sites with the existing `firecrawlSearch`. No new APIs, no new secrets, no new costs beyond existing Firecrawl usage.

