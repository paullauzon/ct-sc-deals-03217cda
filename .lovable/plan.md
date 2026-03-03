

# Widen Sidebar + AI Lead Enrichment from Transcripts & Website

## 1. Widen Sidebar
Change `sm:max-w-3xl` (768px) to `sm:max-w-4xl` (896px) in `src/components/ui/sheet.tsx`.

## 2. Lead Enrichment Feature — The Vision

For an M&A deal origination CRM, the best-case enrichment extracts **deal-qualifying intelligence** from transcripts and the prospect's website, then surfaces it in the sidebar so you can qualify leads faster without re-reading transcripts or manually researching companies.

### What gets enriched (new fields on the Lead type):

| Field | Source | Purpose |
|-------|--------|---------|
| `companyDescription` | Website scrape | What the company does, at a glance |
| `estimatedRevenue` | Transcript + website | Revenue signals mentioned in calls |
| `employeeCount` | Website scrape | Company size indicator |
| `acquisitionCriteria` | Transcript extraction | What they're looking for (sectors, size, geography) |
| `buyerMotivation` | Transcript extraction | Why they're acquiring (roll-up, platform build, diversification) |
| `urgency` | Transcript extraction | Timeline signals — "actively looking" vs "exploring" |
| `decisionMakers` | Transcript extraction | Who else is involved in the decision |
| `competitorTools` | Transcript extraction | Other services/platforms they're using or evaluating |
| `keyInsights` | Transcript AI summary | 3-5 bullet points of deal-critical intelligence |

### Example for Barry Andrews:
Barry is a business owner at National Air Warehouse (HVAC). From his transcript + website, enrichment could extract: company does commercial HVAC in the Southeast, he's founder-owned, looking for HVAC roll-up targets $1-50M, exploring sourcing options for the first time, no current buy-side advisor.

## 3. Implementation Plan

### A. Connect Firecrawl
Link the existing Firecrawl connector to this project so edge functions can scrape company websites.

### B. New edge function: `enrich-lead` (`supabase/functions/enrich-lead/index.ts`)
- Accepts: `{ companyUrl, meetings[], leadName, leadMessage }`
- Step 1: If `companyUrl` exists, scrape it via Firecrawl API (markdown format) to get company info
- Step 2: Combine website content + all meeting transcripts + original form message
- Step 3: Send to Lovable AI (Gemini) with a structured prompt that extracts the enrichment fields above
- Returns: JSON with all enrichment fields

### C. Extend Lead type (`src/types/lead.ts`)
Add new optional enrichment fields:
```
enrichment?: {
  companyDescription: string;
  acquisitionCriteria: string;
  buyerMotivation: string;
  urgency: string;
  decisionMakers: string;
  competitorTools: string;
  keyInsights: string;
  enrichedAt: string;
}
```

### D. Add defaults in LeadContext migration
Add `enrichment: undefined` to `LEAD_DEFAULTS`.

### E. UI: "Enrich Lead" button + enrichment card in sidebar (`src/components/LeadsTable.tsx`)
- Add an "Enrich with AI" button in the sidebar header area
- When clicked, calls `enrich-lead` edge function
- Displays enrichment data in a new "AI Intelligence" section in the sidebar, right after Contact info
- Shows company description, acquisition criteria, buyer motivation, urgency, key insights as a clean card
- Re-enrich button to refresh when new meetings are added

### F. Register edge function in config.toml

| File | Change |
|------|--------|
| `src/components/ui/sheet.tsx` | `sm:max-w-3xl` → `sm:max-w-4xl` |
| `src/types/lead.ts` | Add `enrichment` field to Lead interface |
| `src/contexts/LeadContext.tsx` | Add enrichment default |
| `supabase/functions/enrich-lead/index.ts` | New edge function: scrape website + analyze transcripts |
| `src/components/LeadsTable.tsx` | Add "Enrich with AI" button + enrichment display section |
| `supabase/config.toml` | Register `enrich-lead` function |

### Connector Step
Link the Firecrawl connector to this project before implementing.

