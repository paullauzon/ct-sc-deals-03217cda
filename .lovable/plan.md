

# World-Class Dashboard + SourceCo Lead Integration

## Overview

Three major workstreams: (1) Add SourceCo leads from both uploaded CSVs, (2) add brand/source differentiation throughout the UI, (3) build an analytics-grade dashboard with charts and deep breakdowns.

---

## 1. Data Model Changes

### `src/types/lead.ts`
- Add `brand` field: `"Captarget" | "SourceCo"` to the `Lead` interface
- Expand `LeadSource` to include all 4 form types: `"CT Contact Form" | "CT Free Targets Form" | "SC Intro Call Form" | "SC Free Targets Form"`
- Add `isDuplicate: boolean` and `duplicateOf: string` (email match across brands) fields
- Add `hearAboutUs: string` field (captured in SourceCo forms)
- Add `acquisitionStrategy: string` field (from SourceCo free targets form: "actively sourcing", "thesis-building", etc.)
- Add `buyerType: string` field (from SourceCo intro call form: the role/checkbox data)

### `src/contexts/LeadContext.tsx`
- Update migration to handle new `brand` field (default existing leads to `"Captarget"`)
- Update deduplication to flag cross-brand duplicates instead of merging them — keep both but mark `isDuplicate: true` and `duplicateOf` with the matching lead ID
- Bump schema version to 5

---

## 2. SourceCo Lead Import

### `src/data/sourceCoLeads.ts` (new file)
- Parse both uploaded CSVs into Lead objects, filtering to dates >= Nov 1, 2025
- **SC Intro Call Form** (~100+ leads): Map columns → `brand: "SourceCo"`, `source: "SC Intro Call Form"`. Extract name, email, phone, role, help request, "where did you hear about SourceCo", and all the checkbox fields into structured data
- **SC Free Targets Form** (~100+ leads): Map columns → `brand: "SourceCo"`, `source: "SC Free Targets Form"`. Extract email, name, company, criteria, revenue range, geography, sourcing method, acquisition strategy
- Handle multiline CSV fields (the help request field contains newlines)

### `src/data/leadData.ts`
- Import SourceCo leads and merge with Captarget leads
- Update existing Captarget leads to use new source names (`"CT Contact Form"`, `"CT Free Targets Form"`)
- Cross-brand duplicate detection: after merging, scan for matching emails across brands and flag both sides

---

## 3. Brand Differentiation in UI

### Pipeline cards (`src/components/Pipeline.tsx`)
- Add a small brand indicator on each card: `CT` or `SC` as a tiny badge/label next to the lead name
- Show source form type as secondary text (e.g., "SC · Intro Call" or "CT · Targets Form")

### Leads table (`src/components/LeadsTable.tsx`)
- Update Source column to show brand + form type (e.g., "SC Intro" / "CT Targets")
- Add brand filter dropdown alongside the existing stage filter
- Add a duplicate indicator icon/badge on rows where `isDuplicate === true`
- Lead detail: show brand, duplicate status, and link to duplicate lead if exists

### Lead detail panel
- Show brand prominently in header
- Show duplicate cross-reference if applicable

---

## 4. World-Class Dashboard (`src/components/Dashboard.tsx`)

Complete redesign with deep analytics sections. Using recharts (already installed).

### Section A: Hero Metrics (enhanced)
- Total Leads, Pipeline Value, Win Rate (existing)
- **New**: Leads This Week, Leads This Month, MoM Growth %, Avg Days in Pipeline

### Section B: Lead Volume Over Time (line chart)
- recharts `LineChart` showing weekly lead submissions over time
- Two series: Captarget vs SourceCo, stacked or overlaid
- X-axis: week, Y-axis: count

### Section C: Pipeline Funnel (existing, enhanced)
- Add value labels and percentage drop-off between stages

### Section D: Brand Comparison
- Side-by-side metrics: CT vs SC total leads, pipeline value, conversion rate, avg deal value
- Simple two-column comparison card

### Section E: Source Form Breakdown (bar chart)
- 4 bars: CT Contact, CT Targets, SC Intro Call, SC Targets
- Shows count per source

### Section F: Role/Buyer Type Distribution (horizontal bar chart)
- Group by role (PE, Independent Sponsor, Corporate, Family Office, etc.)
- Show count and % of total

### Section G: Company Leaderboard (table)
- Top 15 companies by lead count, with columns: Company, Lead Count, Total Deal Value, Avg Stage, Sources
- Clickable to filter

### Section H: Geography Breakdown
- Table showing geography distribution from target criteria fields

### Section I: Duplicate Analysis
- Count of cross-brand duplicates
- List of duplicate pairs with both brand sources

### Section J: Lead Velocity & Timing
- Leads per week trend
- Average time from submission to meeting set
- Day-of-week submission heatmap (which days get most leads)

### Section K: Service Interest & Deals Planned
- Existing service interest breakdown (enhanced with chart)
- Deals planned distribution (0-2, 3-10, 10-25, 25-50, 50+)

### Section L: "Where Did You Hear About Us" (SourceCo data)
- Breakdown of referral sources from SourceCo forms

---

## 5. Files Changed

| File | Action |
|------|--------|
| `src/types/lead.ts` | Add `brand`, `isDuplicate`, `duplicateOf`, `hearAboutUs`, `acquisitionStrategy` fields; expand `LeadSource` |
| `src/data/sourceCoLeads.ts` | **New** — parse both SourceCo CSVs, filter Nov 2025+, create Lead objects |
| `src/data/leadData.ts` | Import SourceCo leads, update source names, cross-brand duplicate detection |
| `src/contexts/LeadContext.tsx` | Migration for new fields, bump schema version |
| `src/components/Dashboard.tsx` | Full rebuild with recharts charts, brand comparisons, company leaderboard, role distribution, volume trends, geography, duplicates analysis |
| `src/components/Pipeline.tsx` | Add brand badge to cards |
| `src/components/LeadsTable.tsx` | Brand filter, updated source column, duplicate indicator |
| `src/pages/Index.tsx` | No changes needed |

### Technical Notes
- SourceCo CSV data will be hardcoded into `sourceCoLeads.ts` (same pattern as existing `leadData.ts`) — parsed from the uploaded CSVs
- recharts is already installed — will use `LineChart`, `BarChart`, `ResponsiveContainer`
- Dashboard sections will be collapsible or scrollable to avoid overwhelming on load
- All data continues to persist via localStorage

