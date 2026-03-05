

# Remaining Items: Activity Timeline + Bulk Stage Transitions

From the original 10-item plan, items 1–7 and 10 (Contract Renewals) are already implemented. Two items remain:

---

## Item 8: Activity Timeline (Per-Lead Audit Log)

**What**: A chronological "Activity" tab in the lead detail panel showing stage changes, field updates, meetings added, and notes — with timestamps.

**Database**: New `lead_activity_log` table:
- `id` (uuid, PK)
- `lead_id` (text, not null)
- `event_type` (text — `stage_change`, `field_update`, `meeting_added`, `note_added`, `enrichment_run`)
- `description` (text — human-readable summary like "Stage changed from New Lead → Qualified")
- `old_value` (text, nullable)
- `new_value` (text, nullable)
- `created_at` (timestamptz, default now())

RLS: permissive allow-all (matching existing tables).

**Code changes**:
- **`src/lib/activityLog.ts`** — Helper to write activity events: `logActivity(leadId, eventType, description, oldValue?, newValue?)`
- **`src/contexts/LeadContext.tsx`** — Call `logActivity` inside `updateLead` (detect stage/field changes), `addMeeting`, and note saves
- **`src/components/LeadsTable.tsx`** — Add an "Activity" tab in the lead detail panel that fetches and displays the log chronologically (newest first), with icons per event type

---

## Item 9: Bulk Stage Transitions (Multi-Select Pipeline)

**What**: Checkbox mode on pipeline cards. Select multiple deals, then batch-move to a stage, assign an owner, or set priority.

**Code changes in `src/components/Pipeline.tsx`**:
- Add a "Select" toggle button in the pipeline header to enter multi-select mode
- In select mode, each pipeline card shows a checkbox; clicking toggles selection (stored as `Set<string>`)
- When ≥1 card selected, show a sticky bulk action bar at the bottom with:
  - **Move to Stage** dropdown (all 11 stages)
  - **Assign to** dropdown (Malik / Valeria / Tomos)
  - **Set Priority** dropdown (High / Medium / Low)
  - **Clear Selection** button
- Each bulk action calls `updateLead` for every selected lead, then clears selection
- Activity log entries created for each bulk change

---

**Files to create**: `src/lib/activityLog.ts`
**Files to modify**: `src/contexts/LeadContext.tsx`, `src/components/Pipeline.tsx`, `src/components/LeadsTable.tsx`
**Database migration**: Create `lead_activity_log` table with RLS

