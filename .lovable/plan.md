

# Add Calendly Meeting Details to Deal Card Side Panel

## Verification: Webhook is Live
The Calendly webhook is active and the `ingest-calendly-booking` edge function + realtime handler in `LeadContext.tsx` are already wired up. New bookings will automatically update leads in real-time with toast notifications. This is confirmed working.

## Change: Show Calendly Booking in the Meeting Section

In `src/components/LeadsTable.tsx`, in the "Meeting" section (around line 436), add a Calendly booking info block above the existing meeting fields when `lead.calendlyBookedAt` is present:

- Show a small card with a `CalendarCheck` icon, "Booked via Calendly" label
- Display the meeting date/time formatted nicely (e.g., "Sun, Mar 30 at 2:00 PM")
- Show "Booked on" with the `calendlyBookedAt` timestamp
- This sits at the top of the Meeting section so it's immediately visible

The existing `meeting_date` field already stores the scheduled time from Calendly, and `calendlyBookedAt` stores when they booked. Both are already mapped and available on the `lead` object.

## Files Changed
| File | Change |
|------|--------|
| `src/components/LeadsTable.tsx` | Add Calendly booking info card in the Meeting section when `calendlyBookedAt` is set |

