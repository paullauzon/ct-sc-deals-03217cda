

# Add More Pipeline Stages

## Current State
The pipeline currently has 6 active stages and 3 closed stages:
- **Active**: New Lead > Contacted > Meeting Set > Meeting Held > Proposal Sent > Negotiation
- **Closed**: Closed Won, Closed Lost, Went Dark

## What's Missing
For a proper B2B deal management pipeline (especially for a sourcing/origination service), two critical stages are absent:

1. **Qualified** -- Between "New Lead" and "Contacted". After a lead comes in, someone reviews it to confirm ICP fit, legitimacy, and whether it's worth pursuing. Without this, 94 leads sit in "New Lead" with no way to separate vetted opportunities from unreviewed submissions.

2. **Contract Sent** -- Between "Negotiation" and "Closed Won". In B2B sales, there's always a gap between verbal agreement and signed deal. This stage tracks leads where the proposal has been accepted in principle and a contract/SOW is out for signature.

## New Stage Flow (11 total)

```text
New Lead > Qualified > Contacted > Meeting Set > Meeting Held > Proposal Sent > Negotiation > Contract Sent
                                                                                                    |
                                                                              Closed Won / Closed Lost / Went Dark
```

## Files to Change

### 1. `src/types/lead.ts`
Add "Qualified" and "Contract Sent" to the `LeadStage` union type.

### 2. `src/contexts/LeadContext.tsx`
- Update `STAGES` array to include the two new stages
- Bump `SCHEMA_VERSION` to 4 so existing localStorage data gets migrated
- Add migration logic: existing leads keep their current stage (no data loss)
- Update `getMetrics` to account for new stages in `stageValues`

### 3. `src/components/Pipeline.tsx`
- Add "Qualified" and "Contract Sent" to `PIPELINE_STAGES` array
- No other changes needed -- the pipeline renders dynamically from this array

### 4. `src/components/LeadsTable.tsx`
- The `STAGES` array on line 11 already pulls all stages -- just needs the two new values added
- Stage dropdown in lead detail will automatically include new options

### 5. `src/components/Dashboard.tsx`
- The funnel chart renders from `metrics.stageValues` dynamically -- will automatically pick up new stages with no code change needed (verify after implementation)

## Migration Strategy
Existing leads in localStorage won't break. The migration function in `LeadContext.tsx` already handles missing fields. Since "Qualified" and "Contract Sent" are new stages that no existing lead occupies, no data transformation is needed -- just bumping the schema version ensures the new stage keys exist in `stageValues`.

