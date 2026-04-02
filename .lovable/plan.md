

# Prep Intel: Source Citations + LinkedIn Data Gap

## Two Issues Found

### Issue 1: Claims have no visible source citations

The `enrich-lead` edge function already instructs the AI to cite sources inline (e.g., "(web search: URL)", "(website)", "(form submission)"). The `dataSources` field is returned listing all URLs used. However, **the UI never displays these citations**. The opening hook, value angle, watch outs, and discovery questions show raw text with no indication of where claims originated. This is why "partnership with Shore Capital Partners" appears without verification.

**Fix**: Display the `dataSources` field from enrichment as a collapsible "Sources" section at the bottom of the battle card. Additionally, ensure inline source markers (already in the AI output like "(web search: URL)") are rendered as clickable links rather than stripped.

### Issue 2: LinkedIn data is NOT passed to the enrichment function

The lead object has `linkedinUrl` and `linkedinTitle` fields (populated by the LinkedIn backfill agent). But `PrepIntelTab.tsx` never sends these to `enrich-lead`. The enrichment function does a separate web search for the prospect, but it doesn't have the LinkedIn profile data we already collected. This means:

- The AI is working without the prospect's LinkedIn title, company confirmation, or career context
- We're doing redundant searches when we already have a LinkedIn URL
- The prospect profile and opening hook could be much more specific with LinkedIn data

**Fix**: Pass `leadLinkedinUrl` and `leadLinkedinTitle` to `enrich-lead`. Update the edge function to scrape the LinkedIn profile URL (via Firecrawl) if available, adding it as a high-priority data source for the prospect profile, opening hook, and discovery questions.

## Plan

### 1. Pass LinkedIn data to enrich-lead (PrepIntelTab.tsx)

Add `leadLinkedinUrl: lead.linkedinUrl` and `leadLinkedinTitle: lead.linkedinTitle` to the enrichment payload body (the else branch at line 431).

### 2. Use LinkedIn in the edge function (enrich-lead/index.ts)

- Accept `leadLinkedinUrl` and `leadLinkedinTitle` from the request body
- If `leadLinkedinUrl` exists, scrape it via Firecrawl as a priority data source
- Add it to the source inventory and context: `LINKEDIN PROFILE CONTENT: ...`
- Update the source inventory line: `- LinkedIn profile: YES/NO`

### 3. Show source citations in the UI (PrepIntelTab.tsx)

- After the battle card content (below the ASK section), add a small "Sources" toggle
- When expanded, show `enrichment.dataSources` as a bulleted list of clickable links
- Parse inline citations like `(web search: https://...)` into clickable `<a>` tags throughout the displayed text
- Style sources with muted text and external link icons

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Pass `leadLinkedinUrl` and `leadLinkedinTitle` to enrich-lead body; add Sources section below battle card showing `enrichment.dataSources`; parse inline citation URLs into clickable links |
| `supabase/functions/enrich-lead/index.ts` | Accept `leadLinkedinUrl`/`leadLinkedinTitle`; scrape LinkedIn profile via Firecrawl if URL available; add to source inventory and AI context |

