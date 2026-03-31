

# Add Calendly Meeting Details Tooltip

## Problem
The CalendarCheck icons on pipeline cards and leads table show basic "Booked via Calendly" info, but no details about **which** meeting was booked (event name, type, duration). This data exists in Calendly but we don't store it.

## Solution

### 1. Add 3 new columns to `leads` table
- `calendly_event_name` (text, default `''`) — e.g. "SourceCo Intro", "CAPTARGET Intro"
- `calendly_event_type` (text, default `''`) — e.g. "one_on_one", "group"
- `calendly_event_duration` (integer, nullable) — duration in minutes

### 2. Update edge functions to store this data

**`ingest-calendly-booking/index.ts`**: Extract `event.name`, `event.type`, and duration (calculated from `start_time`/`end_time`) from the Calendly payload and save to the new columns.

**`backfill-calendly/index.ts`**: Same — extract name, type, duration from each scheduled event and store them. Re-run with `?force=true` to populate existing leads.

### 3. Update data mapping & types
- Add `calendlyEventName`, `calendlyEventType`, `calendlyEventDuration` to `Lead` type
- Add mappings in `leadDbMapping.ts`

### 4. Add tooltips on CalendarCheck icons

**`Pipeline.tsx`**: Wrap the CalendarCheck icon+date in a `<Tooltip>` showing:
```
SourceCo Intro · 30 min
Mar 15, 2026 at 2:00 PM
```

**`LeadsTable.tsx`**: Same tooltip on the CalendarCheck icon in table rows and in the side panel booking card.

## Files Changed
| File | Change |
|------|--------|
| Migration | Add 3 columns to `leads` |
| `supabase/functions/ingest-calendly-booking/index.ts` | Store event name, type, duration |
| `supabase/functions/backfill-calendly/index.ts` | Store event name, type, duration |
| `src/types/lead.ts` | Add 3 new fields |
| `src/lib/leadDbMapping.ts` | Add mappings |
| `src/components/Pipeline.tsx` | Add Tooltip on CalendarCheck |
| `src/components/LeadsTable.tsx` | Add Tooltip on CalendarCheck (table row + side panel) |

After deployment, run backfill with `?force=true` to populate all existing leads with meeting details.

