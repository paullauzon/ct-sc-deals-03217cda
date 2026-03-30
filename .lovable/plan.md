

# Fix hours_to_meeting_set & Store Full Meeting Timestamps

## Problems Found

| Issue | Count | Cause |
|-------|-------|-------|
| Negative `hours_to_meeting_set` | 49 of 70 | Seeded leads have `created_at` = March 3 (DB seed date), which is **after** the actual Calendly booking. Formula: `booking - created_at` = negative |
| Missing `meeting_set_date` | 42 of 70 | "Stamped only" branch in backfill doesn't always set it |
| Meeting date loses time | All | `meeting_date` stored as `YYYY-MM-DD` only, discards Calendly's exact start time |

### Root cause for negatives
For imported leads, `created_at` is when the row was seeded into the DB (March 3), not when the lead actually submitted. The actual submission date is in `date_submitted`. When a lead submitted Jan 15 and booked Jan 16, but `created_at` = March 3, the formula gives `-1100 hours`.

## Fix Strategy

### 1. Backfill function (`backfill-calendly/index.ts`)
- Use `date_submitted` as the lead origin time when `created_at > calendly_booked_at` (indicates imported/seeded data)
- Clamp `hours_to_meeting_set` to 0 minimum
- Store full ISO timestamp in `meeting_date` (e.g. `2026-03-30T16:00:00.000Z`) instead of date-only
- Always set `meeting_set_date` from the Calendly event's `created_at` date

### 2. Webhook function (`ingest-calendly-booking/index.ts`)
- Same fallback logic: prefer `created_at`, fall back to `date_submitted` if `created_at > booking time`
- Clamp to 0
- Store full ISO timestamp for `meeting_date`

### 3. UI context (`LeadContext.tsx`)
- Clamp `hoursToMeetingSet` to 0 in manual "Meeting Set" stage changes
- In `meetingSetDate` update handler, also clamp to 0

### 4. Calendly card display (`LeadsTable.tsx`)
- Parse `meeting_date` as full ISO timestamp and display with time (e.g. "Mon, Mar 30 at 4:00 PM")
- Already does this via `parseISO` + `format` — will work automatically once data includes time

### 5. Re-run backfill with `?force=true`
Corrects all 70 Calendly leads. For non-Calendly leads, `hours_to_meeting_set` stays null (correct — no booking happened).

## Files Changed
| File | Change |
|------|--------|
| `supabase/functions/backfill-calendly/index.ts` | Use `date_submitted` fallback, clamp to 0, store full timestamp |
| `supabase/functions/ingest-calendly-booking/index.ts` | Same fallback + clamp logic, store full timestamp |
| `src/contexts/LeadContext.tsx` | Clamp `hoursToMeetingSet` to 0 |

