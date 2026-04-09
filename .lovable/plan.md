

# Fix: GlobalProcessingOverlay Not Rendered

## Problem

`GlobalProcessingOverlay` is imported in `src/pages/Index.tsx` but **never placed in the JSX**. This means the progress panel (bottom-right overlay with live progress, pause/resume, lead-by-lead log) never appears — no matter how many leads are processing.

## Fix

Add `<GlobalProcessingOverlay />` to the JSX in `Index.tsx`, right before the closing `</div>` of the `AppContent` component (line 149). This is a one-line addition.

## Files Changed

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Add `<GlobalProcessingOverlay />` to JSX, after `<LeadDetail>` and before the closing `</div>` |

