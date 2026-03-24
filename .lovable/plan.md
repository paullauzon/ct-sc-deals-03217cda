

# Add Calendly Booking Indicator to Pipeline Cards & Lead Table

## Problem
When a Calendly booking comes in, there's no visual indicator on the pipeline card or lead table showing that this lead booked via Calendly, when the meeting is scheduled for, or a toast notification beyond the existing realtime stage-change update.

## Changes

### 1. Add `calendlyBookedAt` field to track Calendly-sourced bookings
- **`src/types/lead.ts`**: Add `calendlyBookedAt?: string` to the Lead interface
- **`src/lib/leadDbMapping.ts`**: Map `calendly_booked_at` ↔ `calendlyBookedAt`
- **Database migration**: Add `calendly_booked_at text default ''` column to `leads` table

### 2. Update `ingest-calendly-booking` to set the new field
- **`supabase/functions/ingest-calendly-booking/index.ts`**: When updating a lead to "Meeting Set", also set `calendly_booked_at` to the current ISO timestamp. Include the scheduled meeting time in the activity log description.

### 3. Add Calendly icon + meeting date to Pipeline cards
- **`src/components/Pipeline.tsx`**: On each deal card, if `lead.meetingDate` is set and the lead is in "Meeting Set" stage (or has `calendlyBookedAt`), show a small calendar/Calendly icon with the formatted meeting date (e.g., "📅 Mar 25"). This sits alongside existing indicators (LinkedIn, Fireflies).

### 4. Add Calendly indicator to Leads Table
- **`src/components/LeadsTable.tsx`**: In the lead row or detail panel, show a Calendly badge when `calendlyBookedAt` is present, displaying "Booked via Calendly" with the meeting date.

### 5. Realtime update handling
- **`src/contexts/LeadContext.tsx`**: In the UPDATE handler, also pick up `calendly_booked_at` and `meeting_date` changes so the card updates live when a booking arrives. Show a specific toast: "📅 {name} booked a meeting for {date}".

## Files Changed
| File | Change |
|------|--------|
| Database migration | Add `calendly_booked_at` column |
| `src/types/lead.ts` | Add `calendlyBookedAt` field |
| `src/lib/leadDbMapping.ts` | Map new field |
| `supabase/functions/ingest-calendly-booking/index.ts` | Set `calendly_booked_at` on update |
| `src/contexts/LeadContext.tsx` | Handle `calendly_booked_at` + `meeting_date` in realtime, show booking toast |
| `src/components/Pipeline.tsx` | Show calendar icon + meeting date on cards with Calendly bookings |
| `src/components/LeadsTable.tsx` | Show Calendly badge in lead detail/row |

