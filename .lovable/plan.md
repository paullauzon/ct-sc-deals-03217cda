

# Remaining Fixes and Improvements

## What's Working (Verified via Live Testing)
- Modal fields save and update across the system (stage changes reflect in table and pipeline)
- Pipeline view shows draggable cards with days-in-stage tracking
- Dashboard shows all metrics: pipeline value, forecast, ICP fit, meeting outcomes
- All new fields present: Meeting Outcome, Forecast Category, ICP Fit, Won/Lost Reasons
- Lead detail modal has full Contact, Message, Target Criteria, Deal Management, Meeting, and Notes sections

## What Still Needs Fixing

### 1. localStorage Migration (Critical)
If the user previously loaded the app, old lead data is cached in localStorage WITHOUT the new fields (meetingOutcome, forecastCategory, icpFit, wonReason, lostReason). When old data loads, these fields are `undefined` instead of `""`, causing select dropdowns to appear blank/broken.

**Fix**: Add a migration step in `LeadContext.tsx` that checks loaded leads for missing fields and backfills defaults. Also add a version key so future schema changes auto-migrate.

### 2. Console Error: "Function components cannot be given refs"
The `App` component is an arrow function (`const App = () => ...`) receiving a ref from StrictMode/QueryClientProvider. 

**Fix**: This is harmless but noisy. Can be resolved by wrapping App export or ignoring.

### 3. Missing Feature: "Add New Lead" Button
The user's prompt says "create new deals from leads" -- there's no way to manually add a new lead from within the app.

**Fix**: Add a simple "New Lead" button on the Leads page that opens a modal form with required fields (name, email, company, role, source, message) and creates a new entry in context.

### 4. Missing Feature: CSV Export
The user needs their sales team to work with this data. A CSV export button would let them download the current state of all leads with all columns.

**Fix**: Add an "Export CSV" button to the Leads page that generates a CSV from the current leads array.

### 5. Closed Date Auto-tracking
When a lead moves to Closed Won/Lost/Went Dark, the `closedDate` field should be auto-set.

**Fix**: Update the stage-change logic in `LeadContext.tsx` to auto-populate `closedDate`.

---

## Technical Details

### Files to modify:
- **`src/contexts/LeadContext.tsx`** -- Add localStorage migration for missing fields; auto-set `closedDate` on close stages; add version key
- **`src/components/LeadsTable.tsx`** -- Add "New Lead" button + creation modal; add "Export CSV" button
- **`src/App.tsx`** -- Minor: no change needed (ref warning is harmless)

### Implementation sequence:
1. Fix localStorage migration in LeadContext (ensures all existing users see correct data)
2. Add closedDate auto-tracking in updateLead
3. Add New Lead creation form
4. Add CSV export button

