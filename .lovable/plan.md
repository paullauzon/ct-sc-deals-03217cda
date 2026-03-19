

# Fix "Research & Recommend" — Reliability & Persistence Issues

## Problems Found

### 1. No timeout on the edge function call (causes "hangs forever")
The `supabase.functions.invoke("enrich-lead")` call in `LeadsTable.tsx` has **no timeout**. The edge function itself chains 3 Firecrawl calls (scrape + 2 searches) + 1 OpenAI gpt-4o call with tool_choice — each with no individual timeouts. Firecrawl search with `scrapeOptions: { formats: ["markdown"] }` actually scrapes each result page, making it extremely slow (5 search results × full page scrape). Total wall time can easily exceed 60s, hitting Supabase's edge function execution limit.

### 2. Fire-and-forget DB write silently fails (causes "doesn't save")
When enrichment completes, `save({ enrichment: data.enrichment })` calls `updateLead` which calls `updateLeadInDb` as **fire-and-forget** (line 233). If that DB write fails (e.g., JSONB too large, network hiccup), the error is only logged to console — the user sees "Lead enriched" toast but the data is lost on next page load.

### 3. Full lead object written on every update (causes unnecessary large writes)
`updateLeadInDb(id, updated)` on line 233 passes the **entire updated lead object** (including all meetings, submissions, etc.) rather than just the changed fields (`updates`). This means every enrichment write sends the full meetings array, submissions array, etc. to the DB unnecessarily, increasing failure risk for large leads.

### 4. Firecrawl search with scrapeOptions is overkill
The web search calls use `scrapeOptions: { formats: ["markdown"] }` which tells Firecrawl to fully scrape every search result page. This massively increases latency. Snippets from search results are usually sufficient for the AI context.

### 5. No abort/cancel mechanism
If the user navigates away or closes the lead sheet while enrichment is running, there's no `AbortController` to cancel the request — it continues consuming resources.

---

## Fix Plan

### 1. Add client-side timeout + abort controller
In `handleEnrich` in `LeadsTable.tsx`:
- Add an `AbortController` with a 55-second timeout
- Show a specific timeout error message instead of generic failure
- Cancel the request if the component unmounts

### 2. Remove scrapeOptions from Firecrawl search calls
In `enrich-lead/index.ts`, change both `searchWeb` calls to remove `scrapeOptions: { formats: ["markdown"] }`. This returns snippets only — much faster and still provides good context for the AI. This alone should cut 20-30 seconds off execution time.

### 3. Add individual timeouts to external API calls
In `enrich-lead/index.ts`:
- Add 10s timeout to Firecrawl scrape
- Add 8s timeout to each Firecrawl search
- Add 30s timeout to OpenAI call
- Gracefully degrade if scrape/search times out (proceed with whatever data we have)

### 4. Fix the fire-and-forget DB persistence
In `LeadContext.tsx` `updateLead`, change `updateLeadInDb(id, updated)` to `updateLeadInDb(id, updates)` — only write the changed fields, not the entire lead. This reduces payload size and failure risk.

Additionally, add error surfacing: if the DB write fails after enrichment, show a warning toast so the user knows to retry.

### 5. Add retry on enrichment save failure
If the DB update for enrichment fails, automatically retry once before showing the error toast.

### Files Changed
- `src/components/LeadsTable.tsx` — abort controller + timeout on handleEnrich
- `supabase/functions/enrich-lead/index.ts` — remove scrapeOptions from search, add timeouts to all external calls
- `src/contexts/LeadContext.tsx` — fix fire-and-forget to write only changed fields + surface errors

