

# Redesign "Enrich with AI" → "Research & Recommend"

## The Problem

Today, **Enrich with AI** and **Deal Intelligence** overlap ~40%. Both produce objection summaries, deal health scores, sentiment analysis, relationship maps, and competitive landscape. The unique value of each:

- **Deal Intelligence** (from `synthesize-deal-intelligence`): Deep meeting-based psychology, win strategy, power dynamics, stakeholder psychographics — the *internal* behavioral engine.
- **Enrich with AI** (from `enrich-lead`): External web scraping + search, company research, and **CRM field update suggestions** — the *external* research engine.

The fix: Strip all overlapping analytical fields from enrichment. Refocus it as a **Research & Recommend** engine that does three things no other part of the system does:

1. **External Company Dossier** — scraped website + web search intel (company profile, news, leadership, M&A history)
2. **Prospect Psychographic Profile** — from external signals: LinkedIn-style career trajectory inference, public statements, conference appearances, published content. What kind of person is this? What drives them professionally based on their *public* footprint?
3. **CRM Field Suggestions** — the accept/dismiss updates workflow (keep as-is, it's valuable)
4. **Pre-Meeting Ammunition** — external talking points: recent company news, funding rounds, press releases, industry trends affecting them — things you can name-drop in a call to build instant credibility

## Implementation

### 1. Edge Function (`supabase/functions/enrich-lead/index.ts`)

- **Upgrade model** to `google/gemini-2.5-pro` (heavier reasoning for external synthesis)
- **Overhaul system prompt**: Remove the M&A analyst persona overlap. New persona: "Elite competitive intelligence officer + executive profiler." Focus on:
  - External company research synthesis
  - Prospect career/personality profiling from public data
  - Pre-meeting ammunition (recent news, talking points)
  - CRM field recommendations (keep)
- **Overhaul tool schema**: Remove overlapping fields (`objectionsSummary`, `dealRiskAssessment`, `recommendedNextActions`, `competitiveLandscape`, `relationshipMap`, `dealHealthScore`, `engagementTrend`, `likelihoodToClose`, `sentimentAnalysis`). Replace with:
  - `companyDossier`: Structured company profile (size, revenue, M&A history, recent news)
  - `prospectProfile`: Career trajectory, communication style inference, professional motivations, public footprint
  - `preMeetingAmmo`: Recent news, industry context, talking points to build credibility
  - `competitivePositioning`: External competitive landscape (what the web says, not what meetings say)
  - Keep: `keyInsights`, `dataSources`, `suggestedUpdates`

### 2. Types (`src/types/lead.ts`)

- Update `LeadEnrichment` interface: Remove the 9 overlapping fields. Add `companyDossier`, `prospectProfile`, `preMeetingAmmo`, `competitivePositioning` as strings.

### 3. UI (`src/components/LeadsTable.tsx`)

- Rename button: "Enrich with AI" → "Research & Recommend"
- Rename section header: "AI Intelligence" → "External Research"
- Remove the Deal Scorecard (that's Deal Intelligence's job now)
- Restructure display: Company Dossier → Prospect Profile → Pre-Meeting Ammo → Competitive Positioning → Key Insights → Suggested Updates
- Keep the accept/dismiss suggestions workflow unchanged

| File | Changes |
|------|---------|
| `supabase/functions/enrich-lead/index.ts` | New prompt, new tool schema, remove overlap |
| `src/types/lead.ts` | Update `LeadEnrichment` interface |
| `src/components/LeadsTable.tsx` | Rename, restructure display, remove scorecard |

