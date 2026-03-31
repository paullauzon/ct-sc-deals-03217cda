

# Rethink Brand Differentiation: Premium & Minimal

## Current Problem
Logos jammed inline next to names look cluttered — the Captarget wordmark is especially wide and disrupts the clean layout. The SourceCo icon is too small to read. This fights the hyper-minimalist design language.

## Proposed Approach: Colored Left Border Accent

Instead of logos, use a **thin colored left border stripe** on cards and table rows — the same pattern Linear, Notion, and Stripe use for category differentiation:

- **Captarget** → `border-l-2 border-l-red-500` (matches their red brand)
- **SourceCo** → `border-l-2 border-l-amber-500` (matches their gold #C8A951)
- **No brand** → no left border (default)

```text
┌──────────────────────────┐
│ Cody Mauri        [M] ?  │  ← red left border = Captarget
│ Dillarddoor · Corporate  │
│ ...                       │
└──────────────────────────┘

┌──────────────────────────┐
│ John Matthews     [M] ?  │  ← gold left border = SourceCo
│ Renovus · Private Equity  │
│ ...                       │
└──────────────────────────┘
```

This is:
- **Scannable** — color stripe is visible at a glance without reading text
- **Minimal** — no extra elements, just a CSS border
- **Clean** — doesn't compete with the name/company text
- **Premium** — follows Linear/Stripe patterns

## Where It Applies

| Location | Implementation |
|----------|---------------|
| **Pipeline cards** | Add `border-l-2` with brand color to the card div |
| **Leads table rows** | Add `border-l-2` to the `<tr>` element |
| **Side panel header** | Small colored dot or subtle accent |
| **Deal room** | Colored accent on header |

## Additional: Keep Logos for Detail Views Only
In the **side panel header** and **deal room**, show the small logo next to the brand name as a label — but remove it from dense list views (table rows, pipeline cards, action queue).

## Changes

| File | Change |
|------|--------|
| `src/components/Pipeline.tsx` | Remove `<BrandLogo>` from cards, add `border-l-2` with brand color |
| `src/components/LeadsTable.tsx` | Remove `<BrandLogo>` from table rows, add `border-l-2` to `<tr>`; keep logo in side panel header only |
| `src/components/Dashboard.tsx` | Remove inline logos from leaderboard rows, use colored dot |
| `src/components/ActionQueue.tsx` | Remove inline logo, add border accent |
| `src/components/MeetingsSection.tsx` | Remove inline logo, add border accent |
| `src/components/FirefliesImport.tsx` | Remove inline logo |
| `src/pages/DealRoom.tsx` | Keep logo in header (detail view) |
| `src/components/BrandLogo.tsx` | Keep component but only used in detail/header contexts |

