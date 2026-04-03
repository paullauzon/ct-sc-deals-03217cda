

# Make Pending Actions More Prominent & Cleaner

## Current State

The action chip at `text-[10px]` with `bg-secondary/50` and a thin border is too subtle — it blends into the card's badge row. The `ChevronRight` icon is small and the overall element doesn't command attention.

## What Changes

Make the pending actions chip the most visually distinct element on the card — larger text, stronger background, full width, and bolder typography:

- **Size up**: `text-[11px]` instead of `text-[10px]`, `py-1.5` instead of `py-1` for more tap target
- **Full width**: Change from `inline-flex` to `flex w-full` so it spans the card width — this makes it feel like a proper CTA, not an afterthought
- **Stronger contrast**: `bg-secondary` (not `/50`) with `hover:bg-secondary/80` — solid background reads as a button
- **Bolder text**: `font-semibold` instead of `font-medium`, `text-foreground/80` instead of `text-muted-foreground` — the count should be immediately readable
- **Layout**: Count on the left, follow-up date right-aligned with `ml-auto`, chevron at far right — cleaner information hierarchy
- **Remove border**: Drop `border border-border` — the solid background is enough contrast. Cleaner without it
- **Same treatment for doNext fallback** for consistency

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Restyle both action summary divs (lines 455-478): full-width, larger text, stronger background, semibold weight, right-aligned date, no border |

