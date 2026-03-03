

# Root Cause: All Lead Data Lives in localStorage

Every piece of lead data — stages, enrichment results, meetings, transcripts, deal intelligence — is stored exclusively in **browser localStorage** (`LeadContext.tsx`). This means:

- Data in the Lovable preview lives in the preview browser's localStorage
- Data on the live URL lives in a completely separate localStorage
- They never sync. Changes in one are invisible to the other.
- If a user clears their browser or uses a different device, all data is lost.

The `processing_jobs` table in the database is only used as a transient job queue — results are read from it and merged into localStorage, then acknowledged. The leads themselves are never persisted to the database.

## Fix: Migrate Lead Storage to the Database

### 1. Create a `leads` table
A database table mirroring the Lead type: core fields as columns, complex nested data (meetings, submissions, dealIntelligence) as JSONB columns. Include an RLS policy allowing all access (no auth in this app).

### 2. Seed initial data
On first load, if the `leads` table is empty, insert the hardcoded initial leads from `getInitialLeads()`.

### 3. Refactor `LeadContext.tsx`
- Replace localStorage reads with database queries (fetch all leads on mount)
- Replace localStorage writes with database upserts (on `updateLead`, `addLead`, `addMeeting`)
- Keep leads in React state for fast UI, but persist every mutation to the DB
- Remove all `localStorage.getItem/setItem` calls for leads

### 4. Update `ProcessingContext.tsx`
When a job completes and results are applied, the lead updates already go through `updateLead` — so they'll automatically persist to the DB after the refactor.

### Files Changed
- **New migration**: Create `leads` table with appropriate columns + RLS
- **`src/contexts/LeadContext.tsx`**: Full refactor from localStorage to database CRUD
- **`src/data/leadData.ts`**: Keep as seed data source, used only when DB is empty

### Scope
This is a significant refactor — the lead table needs ~30+ columns. I'll use JSONB for complex nested fields (meetings, submissions, dealIntelligence) to keep the schema manageable while making core fields (name, email, company, stage, dealValue, etc.) queryable columns.

