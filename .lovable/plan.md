

# De-Cramp Pipeline Cards: Breathing Room + Visual Hierarchy

## The Problem

Cards use `p-3` padding and `space-y-1.5` gap — everything is packed tight. Seven rows of content with tiny text create visual noise. The card reads as a data dump rather than a scannable summary.

## Changes

### 1. Increase card padding and spacing
- Card: `p-3 space-y-1.5` → `p-4 space-y-2.5`
- This adds ~30% more breathing room between every row

### 2. Add visual separator before intelligence row
- Insert a subtle `border-t border-border/50` divider before the intelligence badges (Row 5), visually grouping the "status" section from the "identity" section above

### 3. Increase badge spacing
- Intelligence badges row: `gap-1.5` → `gap-2`
- Badges padding: `px-1.5 py-0.5` → `px-2 py-1` for easier reading

### 4. Add spacing between closing insight and intelligence
- The italic insight text sits right against the badges — add `mt-1` to give it separation

### 5. Pending actions chip
- Add `mt-1.5` gap above the action chip and slightly more padding `py-2` so it reads as a distinct footer element

### 6. Row 4 (days/meetings) — reduce density
- Increase gap between left (days) and right (icons/meetings) with proper flex spacing

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Increase card padding/spacing, add divider before intelligence row, increase badge sizes, add breathing room between sections |

