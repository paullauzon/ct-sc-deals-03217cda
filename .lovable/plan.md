

# Direct "Backfill All" Button — No Dialog, Combined Calendly + Fireflies

## Problem

The "Process All Leads" button opens a dialog with counts and options. The user wants a single-click action that immediately:
1. Runs the Calendly backfill (matches bookings by email)
2. Queues all remaining unprocessed leads (no meetings, no completed processing job) for Fireflies search

No dialog, no count input — just do it.

## Changes

### `src/components/LeadsTable.tsx`

- Replace the "Process All Leads" button with a "Backfill All Meetings" button
- On click: call `backfill-calendly` with `force=true` first, then call `startBulkProcessing()` for all unprocessed leads
- Show a toast with progress ("Running Calendly sync... then queuing Fireflies search for X leads")
- No dialog — direct execution
- Disable button while running, show spinner

### `src/components/Pipeline.tsx`

- Same treatment for the "Scan N New Leads" button — make it a direct one-click "Backfill Meetings" action instead of opening the dialog
- Calls Calendly backfill then queues Fireflies processing

### `src/contexts/ProcessingContext.tsx`

- Verify `startBulkProcessing` can accept a count of 0 or "all" to process every unprocessed lead without requiring the dialog

## Flow

```text
User clicks "Backfill All Meetings"
  → Toast: "Syncing Calendly bookings..."
  → POST backfill-calendly?force=true
  → Toast: "Found X Calendly matches. Queuing Y leads for Fireflies..."
  → startBulkProcessing(unprocessedCount)
  → Toast: "Processing X leads in background"
```

## Files Changed

| File | Changes |
|------|---------|
| `src/components/LeadsTable.tsx` | Replace "Process All Leads" button with "Backfill All Meetings" — direct execution calling Calendly backfill then bulk Fireflies processing, no dialog |
| `src/components/Pipeline.tsx` | Replace "Scan N New Leads" button with same direct one-click backfill action |

