

# System Sync Audit: Gaps Found

After reviewing every file — Dashboard, LeadsTable, Pipeline, MeetingsSection, DealIntelligencePanel, LeadContext, and types — here are the data flow issues where recent changes are NOT reflected across the system.

---

## Gap 1: NewLeadDialog Missing Fields
`NewLeadDialog` (LeadsTable.tsx line 911-924) hardcodes all fields but **omits** `subscriptionValue`, `billingFrequency`, `contractStart`, `contractEnd`. New leads created through the UI won't have these fields at all (migration only runs on load, not on creation).

**Fix**: Add the missing 4 fields to the NewLeadDialog onSave spread.

## Gap 2: CSV Export Missing New Fields
`exportCSV` (LeadsTable.tsx line 787-800) exports 27 columns but is missing:
- `subscriptionValue`, `billingFrequency`, `contractStart`, `contractEnd`
- Meeting count (`meetings.length`)
- Enrichment status (enriched yes/no)
- Deal intelligence momentum
- Coaching metrics (average talk ratio across meetings)

**Fix**: Add ~6 new columns to the CSV export headers and row mapping.

## Gap 3: Dashboard Missing Intelligence-Driven Metrics
The Dashboard computes extensive analytics but has **zero visibility** into:
- **MRR/ARR**: `subscriptionValue` is tracked per lead but never aggregated. No "Total MRR" or "Total Contract Value" metric.
- **Meeting Intelligence Coverage**: How many leads have meetings? How many have processed intelligence? How many have deal intelligence synthesis?
- **Momentum Distribution**: How many deals are Accelerating / Steady / Stalling / Stalled?
- **Aggregate Coaching**: Average talk ratio across all meetings, question quality distribution.
- **Deal Health Summary**: How many leads have critical alerts vs warnings vs clean.

**Fix**: Add a new "Intelligence Metrics" row to the Dashboard with MRR, intelligence coverage, momentum distribution, and deal health summary counts.

## Gap 4: Pipeline Cards Missing Intelligence Indicators
Pipeline cards show meeting count and outcome but **don't show**:
- Momentum badge (Accelerating/Stalling/Stalled) from `dealIntelligence`
- Risk count from `dealIntelligence.riskRegister`
- Enrichment indicator (has AI enrichment or not)

**Fix**: Add momentum badge and risk indicator to Pipeline card when `dealIntelligence` exists.

## Gap 5: Meeting Removal Doesn't Recalculate
When a meeting is removed (MeetingsSection line 306-308), only the meetings array is updated. But:
- `lastContactDate` is NOT recalculated from remaining meetings
- `dealIntelligence` becomes stale (references removed meeting)
- `nextFollowUp` might reference a removed meeting's next steps

**Fix**: On meeting removal, recalculate `lastContactDate` from remaining meetings and auto-re-synthesize deal intelligence if meetings with intel remain.

## Gap 6: LeadContext `addMeeting` Doesn't Update Contact Date
The `addMeeting` function in LeadContext simply appends a meeting but does NOT update `lastContactDate`. Only the auto-find flow in MeetingsSection does this. If `addMeeting` is called directly, contact dates won't sync.

**Fix**: Update `addMeeting` in LeadContext to also set `lastContactDate` to the meeting date if it's more recent.

---

## Implementation Plan

| File | Changes |
|------|---------|
| `src/components/LeadsTable.tsx` | Fix NewLeadDialog missing fields; add new CSV export columns |
| `src/components/Dashboard.tsx` | Add MRR metric, intelligence coverage stats, momentum distribution, deal health summary |
| `src/components/Pipeline.tsx` | Add momentum badge + risk indicator on pipeline cards |
| `src/components/MeetingsSection.tsx` | Recalculate lastContactDate on meeting removal; re-trigger synthesis |
| `src/contexts/LeadContext.tsx` | Update `addMeeting` to auto-set `lastContactDate` |

All fixes are client-side only. No edge function or database changes needed.

