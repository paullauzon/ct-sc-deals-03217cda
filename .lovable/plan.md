

# Archive Reason + Archived Leads Viewer

## What needs to change

1. **DB**: Add `archive_reason` text column to `leads` table
2. **Archive flow**: Replace the instant-archive click with a small dialog that requires a reason before archiving
3. **Archived folder**: Add an "Archived" tab/view in LeadsTable that loads archived leads with their reason displayed

## Plan

### 1. Migration: add `archive_reason` column
Add nullable `archive_reason text` column to leads table, defaulting to `''`.

### 2. Create `ArchiveDialog` component
A small dialog with:
- Lead name displayed
- Required text input for archive reason (e.g. "Test lead", "Duplicate", "Not a real prospect")
- Cancel / Archive buttons
- Archive button disabled until reason is entered

### 3. Update `archiveLead` in LeadContext
- Change signature to `archiveLead(id: string, reason: string)`
- Write both `archived_at` and `archive_reason` to DB
- Update context type

### 4. Update all archive trigger points
Each place that calls `archiveLead` now opens the dialog instead of archiving directly:
- **LeadsTable.tsx**: Archive button → opens ArchiveDialog
- **Pipeline.tsx**: Archive button → opens ArchiveDialog  
- **DealRoom.tsx**: Archive button → opens ArchiveDialog

### 5. Add "Archived" tab in LeadsTable
- Add a toggle/tab at the top: "Active" | "Archived"
- When "Archived" is selected, query DB for `archived_at IS NOT NULL`
- Show a simplified table: Name, Company, Stage (at time of archive), Archive Reason, Archived Date
- Add "Restore" button per row (clears `archived_at` and `archive_reason`)

## Files Changed

| File | Changes |
|------|---------|
| DB migration | Add `archive_reason text default '' not null` to leads |
| `src/components/ArchiveDialog.tsx` | New — dialog with reason input |
| `src/contexts/LeadContext.tsx` | Update `archiveLead` signature to include reason, write `archive_reason` to DB |
| `src/components/LeadsTable.tsx` | Add ArchiveDialog state, "Archived" tab that fetches and displays archived leads with reasons |
| `src/components/Pipeline.tsx` | Add ArchiveDialog state instead of direct archive call |
| `src/pages/DealRoom.tsx` | Add ArchiveDialog state instead of direct archive call |
| `src/lib/leadDbMapping.ts` | Map `archive_reason` field if needed |

