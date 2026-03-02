

# Comprehensive Gap Analysis and Fix Plan

## What's Working (Verified)
- Modal fields save and reflect in table, pipeline, and dashboard instantly
- Pipeline drag-and-drop moves leads between stages correctly
- Stage changes reset `stageEnteredDate` and `daysInCurrentStage`
- New Lead creation and CSV export work
- All new fields (Meeting Outcome, Forecast Category, ICP Fit, Won/Lost Reasons) present in modal
- localStorage migration backfills missing fields

## What's Still Missing or Broken

### 1. `daysInCurrentStage` is static, not dynamically calculated
Currently stored as a static number that only resets to 0 on stage change. It should be **computed in real-time** from `stageEnteredDate` vs today. Right now every lead shows the days from when it was last saved, not actual elapsed days.

**Fix**: Calculate `daysInCurrentStage` dynamically wherever it's displayed (table, pipeline cards, modal, dashboard) using `Math.floor((today - stageEnteredDate) / 86400000)`.

### 2. Leads table is missing critical columns
The table only shows: Name, Role, Stage, Value, Days, Priority, Date, Source. Missing:
- **Company** -- essential for at-a-glance identification
- **Service Interest** -- core to the use case

**Fix**: Add Company column (after Name) and Service Interest column. Reorder for better scanning.

### 3. No table sorting
Can't click column headers to sort by name, company, stage, value, days, date, etc. This is critical for a deal management spreadsheet.

**Fix**: Add click-to-sort on all column headers with ascending/descending toggle.

### 4. Dashboard is underwhelming
Just plain number boxes. Missing:
- Avg Deal Value metric
- Service Interest breakdown (how many leads per service)
- Source breakdown (Contact Form vs Free Targets Form)
- Stage funnel visualization showing the flow
- Active pipeline value per stage (values show $0 because no deals have values assigned yet, but the structure should show them)

**Fix**: Enrich dashboard with Service Interest distribution, Source distribution, and avg deal value. Add a simple funnel/bar representation for stage counts.

### 5. Select dropdowns show blank for empty values
When `forecastCategory`, `icpFit`, or `meetingOutcome` is `""`, the code passes `"_none"` as value but that's not in the options list. Radix Select renders blank. Users can set a value but can't clear it back.

**Fix**: Use a proper pattern -- either show a "None" option in the dropdown or use `value={val || undefined}` with placeholder text.

### 6. Pipeline column total values not visible
Stage columns show total value only when > 0, but since leads start with $0 deal values, the pipeline looks empty of financial data. The header should always show the count and value.

**Fix**: Always show the value line (even if $0) for clarity.

### 7. Company name extraction in pipeline cards shows domain artifacts
Pipeline cards show company from URL domain extraction (e.g., "Google" for google.com). Some show correctly, others are awkward.

**Fix**: This is from `leadData.ts` -- the company extraction is already reasonable. No major change needed, just ensure company field is shown properly.

---

## Technical Details

### Files to modify:

**`src/components/LeadsTable.tsx`**
- Add Company and Service Interest columns to the table
- Add sortable column headers (click to sort asc/desc)
- Fix SelectField to handle empty string values properly (add a "-- None --" option for optional fields)

**`src/components/Pipeline.tsx`**
- Compute `daysInCurrentStage` dynamically from `stageEnteredDate`
- Always show stage value (even $0) for financial clarity

**`src/components/Dashboard.tsx`**
- Add Avg Deal Value metric to top row
- Add Service Interest distribution section
- Add Source breakdown (Contact Form vs Free Targets Form counts)
- Compute `daysInCurrentStage` dynamically for any display
- Add simple horizontal bar visualization for stage counts

**`src/contexts/LeadContext.tsx`**
- Compute `daysInCurrentStage` dynamically in the state getter or add a utility function

### No new dependencies needed
All changes use existing components and patterns.

