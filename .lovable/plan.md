

# Phase 2: Cross-Tab Filters, Metric Click-Through & Export

## What This Phase Delivers

Three capabilities that transform the dashboard from "read-only report" to "interactive command center":

1. **Cross-tab filter bar** — filter by date range, brand, owner, and priority; filters persist across all 4 tabs
2. **Metric click-through** — click any number in any dashboard block to jump to a filtered lead list
3. **Overview tab export** — copy the Overview tab as an image for board decks

---

## 1. Cross-Tab Filter Bar

A compact filter row rendered between the tab navigation and tab content. Applies to all tabs simultaneously.

```text
┌──────────────────────────────────────────────────────────┐
│ OVERVIEW  PIPELINE  TEAM  BUYERS                         │
├──────────────────────────────────────────────────────────┤
│ 📅 Last 90d ▾  │ Brand: All ▾  │ Owner: All ▾  │ Clear  │
├──────────────────────────────────────────────────────────┤
│ (tab content, now filtered)                              │
└──────────────────────────────────────────────────────────┘
```

**Filters:**
- **Date range**: Last 30d / 60d / 90d / All Time (filters by `dateSubmitted`)
- **Brand**: Captarget / SourceCo / Both
- **Owner**: Malik / Valeria / Tomos / Unassigned / All
- **Priority**: High / Medium / Low / All

Filters are stored in component state (not localStorage — dashboard filters are session-scoped, unlike pipeline filters which persist). A "Showing X of Y leads" indicator sits below the filter bar.

### Implementation
- **`src/components/DashboardFilters.tsx`** (new) — renders the filter bar, exposes `filteredLeads` via a callback
- **`src/components/Dashboard.tsx`** — wrap all tab content to use `filteredLeads` instead of raw `leads`. The `analytics` useMemo receives the filtered array. Add filter state above the tab switch.

---

## 2. Metric Click-Through

Any numeric value on the dashboard becomes clickable. Clicking opens the existing `LeadDetail` sheet with a pre-filtered lead list, or navigates to the Pipeline tab with matching filters applied.

**Examples:**
- Click "12 critical" in Deal Health → opens a list of those 12 leads
- Click "PE" row in Buyer Type Matrix → filters pipeline to PE leads
- Click a rep name in Team scorecard → filters to that rep's deals
- Click a stale lead → opens LeadDetail (already works)

### Implementation
- Add a new state: `filterOverlay: { title: string, leads: Lead[] } | null`
- Render a sheet/dialog listing those leads when set (reuse the bordered list style from Stale Leads)
- Pass `onDrillDown` callbacks into `DashboardAdvancedMetrics` and `DashboardPersonaMetrics`
- Wrap numeric values in clickable spans with `cursor-pointer hover:underline` styling

---

## 3. Overview Export

A small "Copy as Image" button in the Overview tab header. Uses `html-to-image` to capture the Overview content as a PNG, copies to clipboard or downloads.

### Implementation
- Add `html-to-image` package
- Wrap Overview tab content in a `ref`
- Button calls `toPng(ref.current)` and triggers download
- Minimal — single button, no configuration

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/DashboardFilters.tsx` | **New** — filter bar with date range, brand, owner, priority dropdowns |
| `src/components/Dashboard.tsx` | Add filter state, pass `filteredLeads` to analytics and all tabs, add drill-down overlay, add export button |
| `src/components/DashboardAdvancedMetrics.tsx` | Accept `onDrillDown` prop, make numeric values clickable |
| `src/components/DashboardPersonaMetrics.tsx` | Accept `onDrillDown` prop, make table rows clickable |
| `package.json` | Add `html-to-image` dependency |

## Scope

This is a single implementation phase. No new tabs, no new metrics — purely adding interactivity to what's already built.

