

# Prep Intel Upgrade — Sources as Links + Surface Hidden Intelligence

## Two Problems

### 1. Sources display is wrong
Currently sources are in a collapsible numbered list. User wants: URLs as inline hyperlinks throughout the content, and non-URL sources (like "form submission", "website content") in a small dropdown.

### 2. The AI generates 15+ fields but the UI only shows 5
The `enrich-lead` function returns all of these that are **never displayed**:
- `companyDossier` — full company intelligence briefing
- `prospectProfile` — career trajectory, communication style, what motivates them
- `preMeetingAmmo` — 3-5 specific talking points with "why it matters"
- `competitivePositioning` — competitive landscape analysis
- `keyInsights` — 5-7 "read nothing else but this" bullet points
- `decisionMakers` — key people and roles
- `competitorTools` — other services they may use
- `acquisitionCriteria` — target sectors/deal size/geo
- `suggestedUpdates` — AI-recommended CRM field changes (stage, priority, ICP fit)

The current battle card shows only: `openingHook`, `valueAngle`, `watchOuts`, `discoveryQuestions`, and `dataSources`. That's a fraction of the intelligence.

Also: double-quote wrapping bug (AI returns quotes, UI adds more quotes = `""text""`).

## Changes

### 1. Inline source citations (SourcesCitation redesign)

- Parse `dataSources` string: extract items with URLs vs items without
- Items WITH URLs → render as small hyperlink pills inline below the battle card (e.g., `🔗 dillarddoor.com`, `🔗 bloomberg.com/article...`)
- Items WITHOUT URLs (e.g., "Form submission", "LinkedIn title") → show in a small "(+2 more)" dropdown
- Remove the current collapsible list approach

### 2. Surface hidden enrichment fields in the battle card

Restructure the card into a tighter, more complete layout:

```text
┌──────────────────────────────────────────────────────┐
│ HEADER (name, company, meeting, signals)             │
├──────────────────────────────────────────────────────┤
│ 🎯 OPENING HOOK                   │ ACTIONS          │
│ "I saw Dillard Door..."           │ [Research/Brief]  │
│                                    │ [Draft Email]    │
│ 💡 VALUE ANGLE                     │ [Deal Room →]    │
│ Our M&A service can...             │                  │
│                                    │                  │
│ 🔑 KEY INSIGHTS (new!)             │                  │
│ • Most critical signal...          │                  │
│ • Second insight...                │                  │
│                                    │                  │
│ ⚠ WATCH OUTS                      │                  │
│ • Don't assume...                  │                  │
│                                    │                  │
│ 🧠 ASK                             │                  │
│ 1. "How does..."                   │                  │
│                                    │                  │
│ 🔗 dillarddoor.com · bloomberg.com │                  │
│    (+2 non-link sources)           │                  │
├──────────────────────────────────────────────────────┤
│ ▸ Prospect Profile (career, style, motivations)      │
│ ▸ Company Intel (dossier, decision makers, criteria)  │
│ ▸ Competitive Landscape (positioning, competitor tools)│
│ ▸ Suggested CRM Updates (stage→X, priority→Y) [Apply]│
│ ▸ Deep Intel (win strategy, psychology — if meetings) │
└──────────────────────────────────────────────────────┘
```

### 3. Fix double-quote bug
Strip leading/trailing `"` from `openingHook` and `discoveryQuestions` before rendering, since the UI already wraps in quotes.

### 4. Add "Apply" buttons for suggested CRM updates
When `enrichment.suggestedUpdates` exists with recommendations (e.g., `{ stage: { value: "Qualified", reason: "..." } }`), show them in a collapsed section with one-click "Apply" buttons that call `updateLead`.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Redesign SourcesCitation to hyperlink pills + dropdown; add Key Insights section; add collapsed Prospect Profile, Company Intel, Competitive Landscape, Suggested Updates sections; fix double-quote stripping; add Apply buttons for CRM suggestions |

