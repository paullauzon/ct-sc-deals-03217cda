

# Plan: Add Detailed Lead-by-Lead Processing Log

## Problem
The overlay shows counts (20 found, 14 no meetings, 4 failed) but you can't see **which specific leads** fall into each category. You need a scrollable log showing every processed lead and its outcome.

## Solution

### 1. `src/contexts/ProcessingContext.tsx` — Track all processed leads

Add a new field to `BulkJobState`:
```typescript
processedLeads: Array<{ name: string; status: "found" | "no_meetings" | "failed"; meetingsCount?: number; error?: string }>
```

After each lead completes, push an entry with the outcome. This gives the overlay a full log to render.

### 2. `src/components/GlobalProcessingOverlay.tsx` — Add expandable processing log

Add a collapsible section (like the existing error list) that shows **all** processed leads with color-coded status icons:
- ✓ Green — "John Smith (3 meetings)"  
- ○ Gray — "Jane Doe (no meetings)"  
- ✗ Red — "Bob Wilson — timeout error"

This section appears both during processing (live feed) and after completion. It's a scrollable list (max-height with overflow) so it doesn't overwhelm the overlay.

### Files
| File | Change |
|------|------|
| `src/contexts/ProcessingContext.tsx` | Add `processedLeads` array to BulkJobState, push entry after each lead |
| `src/components/GlobalProcessingOverlay.tsx` | Add expandable log section showing each lead's outcome |

