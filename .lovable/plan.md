

# Add Brand Logos Back — Smaller & Properly Positioned

## Approach
Re-add `<BrandLogo>` everywhere, positioned **before the lead name** (left side), using a new smaller `"xxs"` size for dense views. Keep the colored left-border accents as they are — the logos add brand recognition on top.

## BrandLogo Size Update
Add an `xxs` size: `h-3 max-w-[56px]` — compact enough for table rows and pipeline cards without disrupting layout.

## Where Logos Go Back

| Location | Placement | Size |
|----------|-----------|------|
| **Leads table rows** | Before name, inside the name cell flex | `xxs` |
| **Pipeline cards** | Before name in the first row | `xxs` |
| **Action Queue items** | Before name | `xxs` |
| **Dashboard stale leads** | Before name | `xxs` |
| **Meetings section** | Before meeting title | `xxs` |
| **Side panel header** | Keep as-is (`sm`) | `sm` |
| **Deal Room header** | Keep as-is (`md`) | `md` |

## Files Changed
| File | Change |
|------|--------|
| `src/components/BrandLogo.tsx` | Add `xxs` size option |
| `src/components/LeadsTable.tsx` | Add `<BrandLogo size="xxs">` before name in table row |
| `src/components/Pipeline.tsx` | Add `<BrandLogo size="xxs">` before name in card |
| `src/components/ActionQueue.tsx` | Add `<BrandLogo size="xxs">` before name |
| `src/components/Dashboard.tsx` | Add `<BrandLogo size="xxs">` before name in stale leads |
| `src/components/MeetingsSection.tsx` | Add `<BrandLogo size="xxs">` before meeting title |

