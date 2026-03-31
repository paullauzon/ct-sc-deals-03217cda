

# Show Calendly Meeting Details Inline (Not Hidden in Tooltips)

## Changes

### 1. Pipeline Cards (`src/components/Pipeline.tsx`)
Replace the tooltip-wrapped CalendarCheck with a visible inline label showing the event name and date directly:
```
CalendarCheck icon + "SourceCo Intro · 30 min · Mar 15"
```
Remove the `<Tooltip>` wrapper — the info is visible by default in the same compact row.

### 2. Leads Table Rows (`src/components/LeadsTable.tsx`)
In the Stage column, replace the tooltip-wrapped CalendarCheck with visible inline text:
```
[Meeting Set] CalendarCheck "SourceCo Intro · 30 min"
```
Keep it compact — event name and duration shown as `text-[10px]` muted text next to the stage badge.

### 3. Lead Detail Side Panel (`src/components/LeadsTable.tsx`)
Already shows full meeting info in the Meeting section — no change needed there. The booking card with event name, duration, and scheduled time is already visible.

### 4. Deal Room Header (`src/pages/DealRoom.tsx`)
Add Calendly meeting info under the subtitle line (company/role). Show as a small line:
```
CalendarCheck "SourceCo Intro · 30 min · Wed, Mar 15 at 2:00 PM"
```
Only renders when `calendlyBookedAt` exists.

## Files Changed
| File | Change |
|------|--------|
| `src/components/Pipeline.tsx` | Remove Tooltip, show event name + duration inline |
| `src/components/LeadsTable.tsx` | Remove Tooltip from table rows, show event name inline next to stage |
| `src/pages/DealRoom.tsx` | Add Calendly meeting line under company/role in header |

