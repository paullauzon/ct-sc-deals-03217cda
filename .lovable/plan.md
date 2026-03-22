

# Fix: Make Bulk Processing Visible

## Problem
The `GlobalProcessingOverlay` component is imported in `Index.tsx` but **never rendered** in the JSX. The bulk processing runs in the background with zero visual feedback.

## Fix

### 1. Render GlobalProcessingOverlay in Index.tsx
Add `<GlobalProcessingOverlay />` to the `AppContent` component JSX, right after the `LeadDetail` component. Since it's a fixed-position overlay (bottom-right corner), placement in the tree doesn't affect layout.

**File**: `src/pages/Index.tsx` — add one line after `<LeadDetail ... />`:
```tsx
<GlobalProcessingOverlay />
```

This single change will immediately show the processing toast with:
- Current lead being processed (name + index)
- Progress bar
- Step-by-step status messages (searching, analyzing, etc.)
- Stats (found / no meetings / failed)
- Scrollable log of processed leads
- Pause / Resume / Cancel controls
- Completion summary with dismiss button

No other changes needed — the overlay component and processing context already have full functionality built in.

