

# Optimize Leads Toolbar Buttons

## Current State (8 buttons — too many, unclear labels)

| Button | What it actually does | Usage |
|---|---|---|
| Backfill All Meetings | Calendly sync → Fireflies scan → bulk process unprocessed leads | Core workflow |
| Score N Leads | Batch-scores unscored leads (conditional) | Occasional |
| LinkedIn Enrich | Batch LinkedIn profile search for unenriched leads | Core workflow |
| Re-enrich Stale | Re-runs LinkedIn on leads searched 30+ days ago | Rare |
| Process Leads | Opens BulkProcessingDialog for selective processing | Occasional |
| Import Fireflies | Opens FirefliesImportDialog for manual transcript import | Rare |
| Export CSV | Downloads CSV export | Utility |
| New Lead | Opens new lead form | Primary action |

## Problems
- "Backfill All Meetings" is jargon — unclear what "backfill" means
- "Re-enrich Stale" overlaps with "LinkedIn Enrich" — both call the same edge function
- "Process Leads" overlaps with "Backfill All Meetings" — both trigger bulk processing
- "Import Fireflies" is redundant since Backfill already runs Fireflies scan
- 8 buttons create visual clutter and decision paralysis

## Proposed Layout (5 visible buttons + 1 dropdown)

```text
[⚡ Sync All] [in LinkedIn Enrich (138/226)] [▼ More] [Export CSV] [New Lead]
```

### Button 1: "Sync All" (was "Backfill All Meetings")
Clearer name. Does Calendly sync + Fireflies scan + bulk processing. The main "refresh everything" action.

### Button 2: "LinkedIn Enrich" (merged with Re-enrich Stale)
Keep the coverage stats tooltip. Add a small dropdown chevron that reveals two options:
- **Enrich Missing** — current LinkedIn Enrich behavior (unenriched only)
- **Re-enrich Stale** — current Re-enrich Stale behavior (30+ days)

### Button 3: "More ▼" dropdown menu containing:
- **Score Leads** (N) — only shown when unscored leads exist
- **Process Leads** — opens BulkProcessingDialog
- **Import Fireflies** — opens FirefliesImportDialog

### Button 4: "Export CSV" — stays as-is (utility)

### Button 5: "New Lead" — stays as-is (primary action)

## Technical Details

### File: `src/components/LeadsTable.tsx`

- Replace the 8-button row (lines 1171-1290) with the new 5-button layout
- LinkedIn Enrich becomes a split button using `DropdownMenu` from shadcn
- "More" uses `DropdownMenu` to house Score, Process Leads, Import Fireflies
- All existing click handlers remain unchanged — this is purely a UI reorganization
- Score button moves into dropdown but retains the conditional count badge

### No other files change. No backend changes.

