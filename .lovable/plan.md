

# Add Pipeline Stages: Revisit/Reconnect & Long Term Follow Up + Rename Closed Lost → Lost

## New Stage Order (13 stages)

```text
1. New Lead
2. Qualified
3. Contacted
4. Meeting Set
5. Meeting Held
6. Proposal Sent
7. Negotiation
8. Contract Sent
9. Revisit/Reconnect     ← NEW
10. Long Term Follow Up   ← NEW
11. Lost                  ← RENAMED from "Closed Lost"
12. Went Dark
13. Closed Won            ← MOVED to end
```

Active stages (progress bar): 1–8. Terminal/post-active: 9–13.

## Changes Required

### 1. Type definition (`src/types/lead.ts`)
- Add `"Revisit/Reconnect"` and `"Long Term Follow Up"` to `LeadStage` union
- Rename `"Closed Lost"` → `"Lost"`
- Reorder so `"Closed Won"` is last

### 2. Every file referencing "Closed Lost" or stage arrays (~24 files)
Global find-and-replace `"Closed Lost"` → `"Lost"` across all `.ts` and `.tsx` files. Then update all stage order arrays. Key files:

| File | What changes |
|---|---|
| `src/types/lead.ts` | LeadStage type |
| `src/contexts/LeadContext.tsx` | STAGES array, closed-stage checks, metrics |
| `src/components/Pipeline.tsx` | ALL_STAGES, CLOSED_STAGES |
| `src/components/LeadsTable.tsx` | STAGES, ACTIVE_STAGES, DealProgressBar |
| `src/pages/DealRoom.tsx` | ACTIVE_STAGES, DealProgressBar |
| `src/components/Dashboard*.tsx` | All dashboard modules (~8 files) with CLOSED_STAGES sets and stage filters |
| `src/components/PipelineFilters.tsx` | Stage filter options |
| `src/lib/dealHealthUtils.ts` | Stage references |
| `src/lib/leadUtils.ts` | Stage logic |
| `src/lib/playbooks.ts` | Add playbooks for new stages |
| `src/lib/newLeadUtils.ts` | Stage defaults |
| `supabase/functions/process-meeting/index.ts` | Stage enum in AI prompt |
| `supabase/functions/enrich-lead/index.ts` | Stage enum in AI prompt |

### 3. Database migration
- Update any existing leads with `stage = 'Closed Lost'` → `'Lost'` in the database

### 4. Playbooks for new stages
- Add a "Revisit/Reconnect" playbook (re-engagement sequence)
- Add a "Long Term Follow Up" playbook (periodic nurture touchpoints)

### 5. Memory update
- Update `mem://features/pipeline-workflow` with the new 13-stage definition

## No backend schema changes needed
The `stage` column is a plain `text` field — no enum constraint to alter.

