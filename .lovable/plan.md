

# Fix Truncated Calendly Meeting Details on Pipeline Cards

## Problem
The meeting detail text (e.g., "Introductory Call · 25...") is truncated because the `<span>` has `max-w-[120px]` and `truncate` applied.

## Fix
In `src/components/Pipeline.tsx` line 386, remove the `truncate max-w-[120px]` constraint so the full event name, duration, and date are visible. Also left-align the calendly info row by ensuring it's not pushed to the right by `ml-auto` or `justify-end` from its parent flex container.

### Change in `src/components/Pipeline.tsx`
**Line 386**: Change `<span className="truncate max-w-[120px]">` to `<span className="whitespace-nowrap">` — this removes the width cap and truncation while keeping the text on one line.

| File | Change |
|------|--------|
| `src/components/Pipeline.tsx` | Remove `truncate max-w-[120px]`, use `whitespace-nowrap` instead |

