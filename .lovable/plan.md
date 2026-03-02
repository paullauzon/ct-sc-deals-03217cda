

# Comprehensive Lead/Deal Management System Upgrade

## Problems to Fix

1. **Modal fields don't save/update** -- The `LeadDetail` modal opens with a snapshot of the lead but updates don't reflect back because `selectedLead` is a stale copy. Need to pull the live lead from context by ID instead.
2. **Pipeline is not draggable** -- Currently static cards with no drag-and-drop.
3. **Missing fields** -- Meeting Outcome, Forecast Category, Won/Lost Reasons (custom), ICP Fit.
4. **Console warning** -- `Section` component receives a ref it can't handle.

---

## Plan

### 1. Extend the Lead type with new fields

Add to `src/types/lead.ts`:
- `meetingOutcome`: "Scheduled" | "Held" | "No-Show" | "Rescheduled" | "Cancelled" | ""
- `forecastCategory`: "Commit" | "Best Case" | "Pipeline" | "Omit" | ""
- `icpFit`: "Strong" | "Moderate" | "Weak" | ""
- `wonReason`: string (free-text custom)
- `lostReason`: string (free-text custom)

Update `CloseReason` to remain as a dropdown but also add the custom free-text `wonReason`/`lostReason` for detailed explanations.

### 2. Fix modal save/update across the whole system

**Root cause**: `selectedLead` stores a lead object snapshot. When `updateLead` modifies context state, the modal still shows the old snapshot.

**Fix**: Store only `selectedLeadId: string | null` instead of the full lead object. Derive the displayed lead from `leads.find(l => l.id === selectedLeadId)` so it always reflects the latest state. Apply this pattern in both `LeadsTable` and `Pipeline`.

### 3. Make Pipeline draggable

Use native HTML5 drag-and-drop (no new dependencies needed):
- Add `draggable` attribute to pipeline cards
- `onDragStart` stores the lead ID and source stage
- Stage columns get `onDragOver` (prevent default) and `onDrop` handlers
- On drop, call `updateLead(id, { stage: targetStage })` which auto-updates `stageEnteredDate` and `daysInCurrentStage`
- Visual feedback: highlight drop target column with a subtle border change

### 4. Update LeadDetail modal with new fields

Add sections to the modal for:
- **Meeting Outcome** -- Select dropdown (Scheduled / Held / No-Show / Rescheduled / Cancelled)
- **Forecast Category** -- Select dropdown (Commit / Best Case / Pipeline / Omit)
- **ICP Fit** -- Select dropdown (Strong / Moderate / Weak)
- **Won Reason** (shown when stage = "Closed Won") -- free-text input
- **Lost Reason** (shown when stage = "Closed Lost" or "Went Dark") -- free-text input alongside the existing CloseReason dropdown

### 5. Update Dashboard metrics

Add to the dashboard:
- Forecast breakdown (Commit / Best Case / Pipeline values)
- ICP Fit distribution
- Meeting outcomes summary

### 6. Update initial data defaults

Update `leadData.ts` to include default empty values for the new fields so existing leads initialize correctly.

### 7. Fix console warnings

- Add `aria-describedby={undefined}` to `DialogContent` to silence the Radix warning
- The `Section` ref warning is cosmetic and harmless but can be fixed by ensuring no ref is passed to it

---

## Technical Details

### Files to modify:
- `src/types/lead.ts` -- Add new type definitions and fields to Lead interface
- `src/data/leadData.ts` -- Add default values for new fields in `createLead` and target lead creation
- `src/contexts/LeadContext.tsx` -- No changes needed (generic `Partial<Lead>` update already handles new fields)
- `src/components/LeadsTable.tsx` -- Fix selectedLead to use ID-based lookup; add new field controls in modal; fix aria warning
- `src/components/Pipeline.tsx` -- Fix selectedLead to use ID-based lookup; add drag-and-drop with `onDragStart`/`onDrop`; show days-in-stage on cards
- `src/components/Dashboard.tsx` -- Add forecast and ICP metrics sections

### No new dependencies required
HTML5 native drag-and-drop is sufficient for the pipeline. All new fields use existing Select/Input components.

