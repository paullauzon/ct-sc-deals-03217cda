

# Add Undo for Stage Changes

## Problem

Accidentally changing a lead's stage (e.g., marking Brian Steel as "Contacted") triggers irreversible side effects: stageEnteredDate resets, playbook tasks get superseded and new ones created, lastContactDate auto-sets. There's no way to reverse it.

## Solution

Add an **undo toast** pattern. When any stage change happens via `updateLead`, show a toast with an "Undo" button that restores the previous stage and all affected fields within a 5-second window.

## How It Works

1. Before applying a stage change in `updateLead`, snapshot the fields that will be modified: `stage`, `stageEnteredDate`, `daysInCurrentStage`, `lastContactDate`, `closedDate`, `hoursToMeetingSet`, `meetingSetDate`
2. Apply the change as normal (DB write, playbook tasks, etc.)
3. Show a toast: `"Stage changed to Contacted"` with an **Undo** button
4. If Undo is clicked within 5 seconds: call `updateLead` with the snapshot values, and restore superseded playbook tasks

For the immediate fix (Brian Steel): the plan also includes a manual stage selector in the lead detail panel so you can set any lead back to any stage at any time.

## Technical Details

- The undo toast uses Sonner's `action` prop (already installed)
- Playbook task restoration: when undoing, re-query `lead_tasks` where `status = 'superseded'` and `lead_id` matches, update back to `pending`
- The snapshot is stored in a closure within the toast callback

## Files Changed

| File | Changes |
|------|---------|
| `src/contexts/LeadContext.tsx` | Add undo toast with 5-second window on stage changes; snapshot pre-change fields; restore on undo including superseded tasks |

