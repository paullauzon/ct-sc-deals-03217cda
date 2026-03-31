

# Fix Brand Logo Display Issues

## Problems Identified

1. **Captarget wordmark too wide** — The PNG is a wide wordmark ("CAPTARGET") with only a height constraint (`h-3`). On pipeline cards especially, it dominates the row.
2. **SourceCo gold cross invisible** — The 92×92 SVG cross renders at `h-3` (12px) which makes it nearly invisible, and leads without a brand show nothing at all.
3. **No width constraint** — Neither logo has a max-width, so the Captarget wordmark stretches to its natural aspect ratio.
4. **Vertical alignment in table** — The logo and name/email block aren't properly centered in the leads table rows.

## Fix Strategy

### 1. Update `BrandLogo` component
- Add `max-w` constraints so the Captarget wordmark doesn't dominate layouts
- Adjust sizes to be more appropriate for each context:
  - `xs`: `h-3.5 max-w-[72px]` (table rows, pipeline cards, action queue items)
  - `sm`: `h-4 max-w-[80px]` (side panel headers)
  - `md`: `h-5 max-w-[96px]` (deal room)
- Ensure `shrink-0` and `object-contain` are on the img so it scales proportionally
- Return `null` when brand is falsy/empty (leads without a brand set)

### 2. Fix SourceCo logo
The current SVG is a bare gold cross that's hard to see at small sizes. Replace it with the actual SourceCo wordmark/logo from their website for better legibility. Alternatively, if the cross is the intended icon, increase its rendering size or add the "SourceCo" text.

The best approach: fetch the actual SourceCo logo from sourcecodeals.com and save it as a properly sized asset. If the wordmark isn't available in a clean format, create a simple SVG with the gold cross at a more visible size with proper padding.

### 3. Fix vertical alignment
In `LeadsTable.tsx`, ensure the flex container for the name cell has `items-center` (it does) and that the logo image is properly `shrink-0` with consistent dimensions.

## Files Changed
| File | Change |
|------|--------|
| `src/components/BrandLogo.tsx` | Add max-width constraints per size, return null for empty brand |
| `public/sourceco-logo.svg` | Replace with a more visible version (larger cross or wordmark) |
| `src/components/Pipeline.tsx` | Minor alignment fix if needed after logo resize |

