

# World-Class Pipeline Filters & Intelligence-at-a-Glance

## The Sales Veteran's Pipeline Philosophy

A 50-year veteran running a Fortune 100 pipeline doesn't scroll — they **slice**. The pipeline must answer these questions in under 3 seconds:

1. **"Which deals need my attention RIGHT NOW?"** — Stalling deals, overdue follow-ups, aging stages
2. **"What's my forecast by owner?"** — Who's carrying weight, who's behind
3. **"Where's the money?"** — Filter by deal size, service interest, priority
4. **"What's at risk?"** — Deals going dark, objections unresolved, momentum declining

## Filter Bar Design

A horizontal, always-visible filter strip above the pipeline columns. Compact chip-style multi-select dropdowns. Active filters show as removable chips.

### Filters to Add

| Filter | Values | Why It Matters |
|--------|--------|----------------|
| **Deal Owner** | Malik, Valeria, Tomos, Unassigned | Instantly see one rep's book |
| **Priority** | High, Medium, Low | Focus on what matters |
| **Brand** | Captarget, SourceCo | Split pipeline by product line |
| **Service Interest** | All 6 options + TBD | See what's selling |
| **ICP Fit** | Strong, Moderate, Weak, Unscored | Kill weak-fit deals early |
| **Forecast Category** | Commit, Best Case, Pipeline, Omit | Real revenue forecast view |
| **Deal Momentum** | Accelerating, Steady, Stalling/Stalled | Spot dying deals |
| **Days in Stage** | <7d, 7-14d, 14-30d, 30d+ | Age = risk |
| **Has Meetings** | Yes / No | Deals with engagement vs. cold |
| **Deal Value Range** | <$5K, $5-25K, $25-100K, $100K+ | Focus on big fish |

### Summary Stats Bar

Below the filters, a dynamic stats strip that **updates with active filters**:

```text
┌──────────────────────────────────────────────────────────┐
│  Showing 23 of 45 deals │ $1.2M pipeline │ 4 stalling  │
│  Avg 12d in stage │ 6 overdue follow-ups              │
└──────────────────────────────────────────────────────────┘
```

### Quick-Filter Presets (One-Click Views)

Buttons above the filter bar for the views a veteran checks daily:

- **🔥 Needs Attention** — Priority High + (Days >14 OR momentum Stalling OR overdue follow-up)
- **💰 Big Deals** — Deal value >$25K
- **📅 Overdue Follow-ups** — nextFollowUp date is past
- **⚡ Hot Momentum** — Momentum = Accelerating
- **👤 My Deals** — Quick toggle per owner

## Implementation

### Files to Modify
- **`src/components/Pipeline.tsx`** — Add filter bar component above columns, wire filter logic into `matchesSearch` equivalent, add summary stats bar, add preset buttons

### Approach
- All filter state lives in Pipeline component (useState for each filter)
- Filters compose with AND logic (all must match)
- Each filter is a compact popover with checkboxes (using existing Popover + Checkbox components)
- Presets set multiple filters at once
- Summary stats recompute from filtered leads
- Persist active filters to localStorage so they survive page navigation
- Existing search bar remains and combines with filters

No database changes needed — all data already exists on the Lead type.

