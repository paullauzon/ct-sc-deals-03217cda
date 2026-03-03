

# Add Revenue/Contract Fields + AI-Integrated Enrichment

## What the user wants
1. **New deal fields** inspired by the screenshot: subscription value, contract start/end, billing frequency, and a deal progress bar — giving a complete deal overview in the side panel.
2. **Smarter AI enrichment** that ingests ALL populated lead fields + meeting intelligence (objections, deal signals, pain points, etc.) and synthesizes a holistic deal assessment — not just company research.

## Changes

### 1. Add new fields to Lead type (`src/types/lead.ts`)

Add to the `Lead` interface:
- `subscriptionValue: number` — monthly recurring revenue
- `billingFrequency: "Monthly" | "Quarterly" | "Annually" | ""`
- `contractStart: string` — date
- `contractEnd: string` — date
- `closedDate: string` — already exists, keep

### 2. Add deal progress bar + revenue/contract section to side panel (`src/components/LeadsTable.tsx`)

Based on the screenshot reference:
- **Deal Progress bar** at the top: a horizontal segmented bar showing the 6 active stages (New → Negotiating) with the current stage highlighted and days count. Uses the existing `lead.stage` field.
- **Revenue / Contract section**: new section with subscription value input (`$0/mo`), contract start/end date pickers, and billing frequency dropdown.
- Rearrange the existing fields into a cleaner 4-column grid layout (Status, Priority, Forecast, ICP Fit on one row; Service Interest, Owner, Deal Value, Close Date on next row; Last Contact, Next Follow-up, Meeting Date, Meeting Outcome on third row) — matching the screenshot's layout.

### 3. Initialize new fields in lead data (`src/data/leadData.ts`, `src/contexts/LeadContext.tsx`)

Add default values for new fields so existing leads don't break: `subscriptionValue: 0`, `billingFrequency: ""`, `contractStart: ""`, `contractEnd: ""`.

### 4. Expand AI enrichment to synthesize all lead data (`supabase/functions/enrich-lead/index.ts`)

Currently the enrichment only receives: `companyUrl`, `meetings`, `leadName`, `leadMessage`, `leadRole`, `leadCompany`.

**Expand to send ALL populated fields** from the lead, including:
- Stage, priority, deal value, service interest, forecast category, ICP fit
- Meeting intelligence from all meetings (deal signals, objections, pain points, sentiment, action items)
- Subscription value, contract dates
- Close reason, won/lost reason, notes

**Update the enrichment tool schema** to add new output fields:
- `objectionsSummary`: Consolidated objections from all meetings with recommendations
- `dealRiskAssessment`: Overall deal risk based on signals, stage velocity, and sentiment trends
- `recommendedNextActions`: Specific actions based on current stage + all intelligence
- `competitiveLandscape`: Aggregated competitive intel from all meetings
- `relationshipMap`: Key stakeholders and their roles/influence from meetings
- `dealScorecard`: Quick assessment fields — deal health, engagement trend, likelihood to close

**Update the system prompt** to instruct the AI to cross-reference meeting intelligence with deal fields (e.g., "The deal is in Negotiation stage but sentiment is Cautious — flag this risk").

### 5. Update enrichment UI section (`src/components/LeadsTable.tsx`)

Add display for new enrichment fields (objections summary, risk assessment, recommended actions, relationship map, deal scorecard) using the existing `EnrichField` component pattern.

### 6. Pass full lead context from the client (`src/components/LeadsTable.tsx`)

Update `handleEnrich` to send all relevant lead fields to the edge function, not just the current subset.

| File | Change |
|------|--------|
| `src/types/lead.ts` | Add `subscriptionValue`, `billingFrequency`, `contractStart`, `contractEnd` to Lead; expand `LeadEnrichment` with new AI fields |
| `src/components/LeadsTable.tsx` | Add deal progress bar, revenue/contract section, 4-col field layout, pass full lead to enrichment, display new enrichment fields |
| `src/data/leadData.ts` | Add defaults for new fields |
| `src/contexts/LeadContext.tsx` | Add defaults for new fields in lead creation |
| `supabase/functions/enrich-lead/index.ts` | Accept full lead data, aggregate meeting intelligence, add new tool schema fields, update prompt to cross-reference all data |

