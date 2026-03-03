

# Enforce Factual-Only AI Enrichment with Mandatory Source Citations

## Problem

The current enrichment prompt asks for citations but the AI can still hallucinate facts that aren't in the source material. The prompt needs to be stricter, and we should also add a **web search** step (via Firecrawl search) to give the AI more factual data to work with --- reducing the temptation to guess.

## Changes

### 1. Add web search as a data source (`enrich-lead/index.ts`)

Before calling the AI, run a Firecrawl web search for `"{company name}" {lead role or "acquisitions"}` to pull in publicly available facts (LinkedIn profiles, press releases, Crunchbase data). This gives the AI real data instead of forcing it to guess.

- Use Firecrawl search API with `scrapeOptions: { formats: ["markdown"] }` to get content from top 3 results
- Truncate combined web results to ~3000 chars
- Add as a new context section: `Web Search Results:\n{content}`

### 2. Harden the system prompt against hallucination (`enrich-lead/index.ts`)

Strengthen the prompt with explicit anti-hallucination rules:

- Every claim MUST have an inline citation: `(website)`, `(form submission)`, `(meeting: {title})`, or `(web search: {source URL})`
- If a field has no factual data from any source, return exactly: `"Not available from current data"`
- Add explicit instruction: "Do NOT infer revenue figures, employee counts, or deal sizes unless explicitly stated in source material. Do NOT fabricate names, titles, or companies."
- Tell the AI which sources are actually present (e.g., "You have: website content, form submission. You do NOT have meeting transcripts.") so it knows what it can and cannot cite

### 3. Pass source availability flags to the AI (`enrich-lead/index.ts`)

Before the user content, prepend a "Source Inventory" block:
```
AVAILABLE SOURCES:
- Website content: YES (scraped from atriumhomeservices.com)
- Form submission: YES
- Meeting transcripts: NO (0 meetings)
- Web search results: YES (3 results)

You may ONLY cite sources marked YES. Any claim without a valid citation must say "Not available from current data."
```

### 4. Update `dataSources` description in tool schema

Change to: `"List each source actually used with specifics, e.g. 'Website (atriumhomeservices.com), Form Submission, Web Search (linkedin.com/in/..., crunchbase.com/...)'. Only list sources you actually cited."`

### 5. Update LeadEnrichment type (`src/types/lead.ts`)

No type changes needed --- `dataSources` is already a string field.

| File | Change |
|------|--------|
| `supabase/functions/enrich-lead/index.ts` | Add Firecrawl web search step, harden prompt, add source inventory block |
| `src/types/lead.ts` | No changes needed |
| `src/components/LeadsTable.tsx` | No changes needed (already displays dataSources) |

