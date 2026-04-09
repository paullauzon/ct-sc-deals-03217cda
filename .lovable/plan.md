

# Archive Leads Feature

## Problem
Test leads like "Adam Haile" (the user themselves) clutter the pipeline. There's no way to remove leads without deleting them. Need a safe archive that hides leads from the entire system while preserving data.

## Approach

Add an `archived_at` column to the `leads` table. Archived leads are filtered out everywhere — no new stage, no deletion. A simple archive/unarchive action on each lead.

### 1. Database Migration

Add `archived_at` (nullable timestamp) to the `leads` table:
```sql
ALTER TABLE leads ADD COLUMN archived_at timestamptz DEFAULT NULL;
```

### 2. Filter archived leads at the source — `LeadContext.tsx`

In `fetchLeadsFromDb()`, add `.is("archived_at", null)` to the query so archived leads never enter React state. This means every component (Dashboard, Pipeline, Command Center, etc.) automatically excludes them with zero changes.

### 3. Add `archiveLead` and `unarchiveLead` to LeadContext

- `archiveLead(id)`: sets `archived_at = now()` in DB, removes lead from local state, shows toast with Undo
- Context type gets `archiveLead: (id: string) => void`

### 4. Add Archive button to the UI

- **LeadsTable**: Add an "Archive" option to each lead row's actions dropdown (or right-click menu)
- **DealRoom**: Add an "Archive Lead" button in the lead header area
- **Pipeline card**: Add archive to the card's action menu

### 5. Archived Leads view (optional but useful)

Add a small "Archived" link/filter in the Leads table header that queries `leads` where `archived_at IS NOT NULL`, showing archived leads with an "Unarchive" button.

## Files Changed

| File | Changes |
|------|---------|
| Migration | `ALTER TABLE leads ADD COLUMN archived_at timestamptz DEFAULT NULL` |
| `src/contexts/LeadContext.tsx` | Filter `.is("archived_at", null)` in fetch query. Add `archiveLead` function that updates DB and removes from state. Add to context type. |
| `src/components/LeadsTable.tsx` | Add "Archive" action to lead row actions. Add "Show Archived" toggle that loads archived leads separately. |
| `src/pages/DealRoom.tsx` | Add "Archive" button in lead header. Navigate back after archiving. |
| `src/components/Pipeline.tsx` | Add "Archive" to pipeline card dropdown menu. |

