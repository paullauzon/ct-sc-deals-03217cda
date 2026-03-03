

# Reduce Hallucination in AI Enrichment

## Problem

The enrichment looks plausible but some details (specific dollar figures, names of decision makers) may be hallucinated vs. sourced from the website. The AI has no way to distinguish "I read this on the website" from "I'm inferring this."

## Solution: Add source attribution to each field

### 1. Update the AI prompt to require citations (`enrich-lead/index.ts`)

Add to the system prompt:
```
For EVERY claim you make, indicate the source in parentheses: (website), (form submission), or (meeting transcript). 
If you cannot cite a specific source for a claim, do NOT include it — say "Not available from current data" instead.
```

### 2. Add a `sources` field to the tool schema (`enrich-lead/index.ts`)

Add a new `dataSources` property to the tool parameters:
```json
"dataSources": {
  "type": "string", 
  "description": "Which data sources were available: list of 'website', 'form submission', 'meeting transcripts' that had actual content"
}
```

This gets displayed at the bottom of the enrichment card so the user knows what the AI had access to.

### 3. Show data sources in enrichment UI (`LeadsTable.tsx`)

Below the "Enriched on..." date, show which sources were used:
```
Sources: Website, Form Submission
```
or
```
Sources: Website, Form Submission, 2 Meeting Transcripts
```

This lets the user immediately see "oh, this was enriched without any meetings — I should re-enrich after adding meetings."

### 4. Pass meeting count metadata (`enrich-lead/index.ts`)

Add to the enrichment response:
```json
"meetingCount": meetings.filter(m => m.transcript).length,
"hadWebsite": websiteContent.length > 0,
"hadFormMessage": !!leadMessage
```

| File | Change |
|------|--------|
| `supabase/functions/enrich-lead/index.ts` | Add citation requirement to prompt, add `dataSources` to tool schema, return source metadata |
| `src/components/LeadsTable.tsx` | Display data sources used below enrichment date |
| `src/types/lead.ts` | Add `dataSources?: string` and source metadata fields to `LeadEnrichment` |

