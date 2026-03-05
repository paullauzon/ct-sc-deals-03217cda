

# Design & UX Audit: What a $100M/yr Design Team Would Fix

After reviewing every view (Today, Dashboard, Pipeline, Leads, Deal Room, Command Palette) and all components, here is a precise inventory of what needs refinement for maximum cleanliness, premiumness, and productivity.

---

## Category 1: Eliminate Visual Noise & Inconsistencies

### 1a. Remove emoji icons — replace with consistent system
**Problem**: The codebase uses a mix of emoji (🔴, ⚠️, 🆕, ⏳, 📅, 📋, 🎯, ⚡, 👥, 🔄, ⏱, 📊) and Lucide icons inconsistently. Emojis render differently per OS, break the monochrome aesthetic, and look unprofessional.

**Files affected**: 
- `ActionQueue.tsx` lines 166-171 (filter chips use emoji: 🔴, 📅, ⚠️, 🆕, 📋, ⏳)
- `Pipeline.tsx` lines 344, 347, 395 (🔄, 👥, ⚠ in card content)
- `Pipeline.tsx` lines 362 (closing insight emojis: ⚡, 🎯, ⏱, 📊)
- `DashboardAdvancedMetrics.tsx` line 361 (🎯 Coaching Insights heading)
- `DashboardAdvancedMetrics.tsx` line 407 (📋 Contract Renewals heading)
- `Dashboard.tsx` line 484 (⚠ in weakest link text)
- `Dashboard.tsx` line 555 (⚠ in Stale Leads heading)
- `DealRoom.tsx` line 337 (⚡ Win Strategy heading)

**Fix**: Replace all emojis with Lucide icons or plain text labels. Use color-coded dots (small `<span>` circles) for severity indicators instead of emoji.

### 1b. Remove colored backgrounds from badges/chips in pipeline cards
**Problem**: Pipeline cards use colored backgrounds (emerald, red, amber) for momentum/risk badges. These clash with the black-and-white design language. The aging border already signals urgency.

**Fix**: Use monochrome badges — `bg-secondary text-foreground` for all, with font-weight or opacity variations for severity. Reserve color ONLY for the aging border system.

### 1c. Standardize section headings across Dashboard
**Problem**: Dashboard section headings inconsistently use `h2` with different patterns — some have emoji prefixes, some have `uppercase tracking-wider`, some have inline subtext. No consistent visual rhythm.

**Fix**: Unified heading pattern: `<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">` with no emoji, no inline spans.

---

## Category 2: Information Density & Layout Optimization

### 2a. Dashboard is too long — needs progressive disclosure
**Problem**: Dashboard is 883 lines rendering 20+ sections in one scroll. A leader wants the top 5 numbers in 2 seconds, not a scroll marathon. The "More Analytics" collapsible helps but the core dashboard is still overwhelming.

**Fix**: 
- Move Pipeline Funnel, Owner Workload, Stale Leads, Forecast Summary, Lead Volume chart, Brand Comparison, Service by Brand INTO the "More Analytics" collapsible
- Keep above the fold: Hero metrics (4 cards) → Action strip (6 cards) → Intelligence row (4 cards) → Revenue at Risk + Forecast vs Target + Stage Conversion (3-col) → Sales Velocity + Weighted Pipeline (2-col)
- Everything else goes into collapsible sections

### 2b. Pipeline cards have too many rows
**Problem**: Each pipeline card shows up to 8 rows of info (name, company, source, submissions, associates, service, value/priority, closing insight, days/meetings, intelligence badges, suggestions, close reason, follow-up). Most cards show 6+ rows making columns very tall.

**Fix**: 
- Remove the duplicate source row (line 342 — `brandAbbr · sourceShort` repeats brand already shown in the badge)
- Remove the submissions count row for single-submission leads (only show if >1)
- Collapse intelligence badges + closing insight into a single row
- Maximum 5 rows per card

### 2c. Deal Room right sidebar shows empty states unnecessarily
**Problem**: When a deal has no stakeholders, risks, or action items, the right sidebar shows three "No X yet" messages, wasting 320px of screen width.

**Fix**: If all three sections are empty, collapse the right sidebar entirely and give the center workspace full width. Show sidebar only when there's data to display.

---

## Category 3: Interaction & Navigation Polish

### 3a. Today view action items lack row density control
**Problem**: Each action item row is 56px+ tall with icon circles, nested text, and value display. With 157 items, this creates excessive scrolling.

**Fix**: 
- Remove the colored icon circles — use a thin 3px left border color instead (same color system)
- Compact rows to ~40px height
- Show deal value inline with the label, not on a separate line

### 3b. Command palette ⌘K button in nav is mispositioned
**Problem**: The `⌘K Search` button in the top nav looks like a random afterthought — small, unstyled, right-aligned. It doesn't communicate "power feature."

**Fix**: Make the search trigger look like a search bar: a wider muted input-like element (like Figma/Linear's search bar) with `⌘K` as a subtle right-aligned shortcut hint. Width ~200px.

### 3c. Pipeline view: filter chips need active state visibility
**Problem**: Quick-filter presets ("Needs Attention", "Big Deals", etc.) look identical whether active or not — only a click reveals the filter state. The summary stats bar doesn't clearly indicate a filtered vs. unfiltered view.

**Fix**: Active quick-filter presets should have `bg-foreground text-background` (inverted). Add a "Filtered" indicator next to the stats bar when any filter is active.

### 3d. Deal Room: no way to navigate between deals
**Problem**: In the Deal Room, you have to go back to pipeline and click another deal. A sales rep reviewing deals in sequence wants Previous/Next arrows.

**Fix**: Add `←` / `→` navigation arrows in the Deal Room top bar that cycle through leads (optionally filtered by the same pipeline filter state).

---

## Category 4: Typography & Spacing Refinements

### 4a. Inconsistent card border patterns
**Problem**: Dashboard cards use three different border patterns:
- `border border-border border-t-2 border-t-foreground` (hero cards, sales velocity)
- `border border-border border-l-4 border-l-red-500` (revenue at risk)
- `border border-border` (standard)

This creates visual inconsistency.

**Fix**: Use exactly TWO patterns:
1. Primary emphasis: `border-t-2 border-t-foreground` (hero metrics, key insights)
2. Standard: `border border-border` (everything else)

Remove the `border-l-4` variant. Use text color for emphasis instead.

### 4b. Too many font sizes in use
**Problem**: The system uses text-[10px], text-[9px], text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl — 9+ sizes. A premium system uses 4-5 max.

**Fix**: Standardize on 5 sizes:
- `text-[10px]` — micro labels only (brand badges, stage abbreviations)
- `text-xs` — secondary info, metadata
- `text-sm` — body text, table cells
- `text-lg` — section values
- `text-2xl` — hero numbers

Remove `text-[9px]` (stage weight labels in weighted pipeline), `text-3xl` (sales velocity — downsize to `text-2xl`), `text-base` (barely used).

---

## Implementation Order (by impact-to-effort ratio)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 1 | Replace all emojis with Lucide icons/dots | 5 files | Medium |
| 2 | Compact pipeline card rows (remove duplicate source row) | Pipeline.tsx | Low |
| 3 | Redesign ⌘K trigger as search bar | Index.tsx | Low |
| 4 | Compact Today view rows (left border, inline values) | ActionQueue.tsx | Medium |
| 5 | Standardize dashboard card borders | Dashboard.tsx, DashboardAdvancedMetrics.tsx | Low |
| 6 | Collapse empty Deal Room sidebar | DealRoom.tsx | Low |
| 7 | Move secondary dashboard sections into collapsible | Dashboard.tsx | Medium |
| 8 | Monochrome pipeline intelligence badges | Pipeline.tsx | Low |
| 9 | Add deal-to-deal navigation in Deal Room | DealRoom.tsx | Medium |
| 10 | Standardize font sizes (remove 9px, 3xl) | Multiple | Low |

All changes are CSS/JSX only — zero database changes, zero new dependencies.

