

# Stale Enrichment Detection for Research & Recommend

## Current Behavior

Research & Recommend **does** use meeting data when available:
- It receives meeting **summaries** (not full transcripts — by design, since Deal Intelligence handles deep transcript analysis)
- It receives aggregated **meeting intelligence** (objections, pain points, competitors, champions)
- It receives the synthesized **deal intelligence**

However, if enrichment ran *before* meetings were added, none of that meeting context was available. The enrichment result is stale but there's no indication of this.

## Fix

### 1. Add a "stale enrichment" banner in the EnrichmentSection UI
Compare `enrichment.enrichedAt` against the dates of meetings on the lead. If any meeting was added **after** the enrichment timestamp, show an amber warning banner:

> "⚠ Research ran before [N] meeting(s) were added. Re-research to include meeting intelligence."

With a one-click "Re-research now" button inline.

### 2. Also detect: enrichment exists but had no meetings, now meetings exist
If the enrichment's source inventory (stored in `dataSources`) shows no meetings were used, but the lead now has meetings with intelligence — show the same banner.

### Files Changed
- `src/components/LeadsTable.tsx` — Add staleness check logic and amber banner in `EnrichmentSection`

