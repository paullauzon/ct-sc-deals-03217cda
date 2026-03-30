

# Fix: `hours_to_meeting_set` Calculated Incorrectly

## Problems Found

There are **3 different calculation methods** across the codebase, and **2 of them are wrong**:

| Location | Formula | Correct? |
|----------|---------|----------|
| **LeadContext.tsx** (manual stage change) | `meetingSetDate - dateSubmitted` | Closest to correct, but uses `dateSubmitted` instead of `created_at` |
| **ingest-calendly-booking** (webhook) | `now() - created_at` | **Wrong** — uses current time instead of the Calendly booking time |
| **backfill-calendly** (backfill) | `now() - created_at` | **Wrong** — uses backfill execution time, not actual booking time |

The correct formula should be: **time the meeting was actually booked** minus **when the lead was created** (`created_at`).

### Specific bugs:
1. **Webhook (`ingest-calendly-booking`)**: Uses `now` (when the webhook fires) which is roughly correct since it fires immediately — but should use the Calendly event's `created_at` for precision.
2. **Backfill (`backfill-calendly`)**: Uses `now` at backfill runtime, which is **days/weeks** after the actual booking. A lead that booked 2 weeks ago gets `hours_to_meeting_set` = hundreds of hours too high.
3. **UI (`LeadContext.tsx`)**: Uses `dateSubmitted` (form submission date string, date-only precision) instead of `created_at` (timestamp with time precision). Also only triggers when `meetingSetDate` is explicitly passed alongside the stage change.

### Screenshot context
The screenshot shows "Hours to Meeting Set: —" which means `null`. This happens when a lead reaches "Meeting Set" via a path that doesn't set `meetingSetDate` (e.g., manual stage drag without also setting meeting date).

## Fix

### 1. `supabase/functions/ingest-calendly-booking/index.ts`
- Use the Calendly event's creation timestamp (from webhook payload) instead of `now` for the calculation
- Formula: `(calendly_event_created_at - lead.created_at) / 3600000`

### 2. `supabase/functions/backfill-calendly/index.ts`  
- Use the Calendly event's `created_at` field (available on each event object) instead of `now`
- Formula: `(event.created_at - lead.created_at) / 3600000`

### 3. `src/contexts/LeadContext.tsx`
- When stage changes to "Meeting Set" (line ~237), auto-calculate `hoursToMeetingSet` using `createdAt` field if not already set
- Use `new Date()` as the meeting-set moment (since user is manually setting it now)
- Formula: `(now - lead.createdAt) / 3600000`
- This ensures manual stage changes also populate the metric

## Files Changed
| File | Change |
|------|--------|
| `supabase/functions/ingest-calendly-booking/index.ts` | Use Calendly event creation time instead of `now` |
| `supabase/functions/backfill-calendly/index.ts` | Use event `created_at` instead of `now` |
| `src/contexts/LeadContext.tsx` | Auto-calc `hoursToMeetingSet` on manual "Meeting Set" stage change |

After fixing, we should re-run the backfill with `?force=true` to correct all existing values.

