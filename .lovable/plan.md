

# Add Meeting Date/Time to Leads Table Row

## Problem
The leads table row shows Calendly event name and duration (e.g., "Introductory Call · 25m") but not **when** the meeting is scheduled. Users need the date/time at a glance.

## Change in `src/components/LeadsTable.tsx`

**Line 1233**: Append a formatted meeting date after the duration:

```tsx
<span className="whitespace-nowrap">
  {lead.calendlyEventName || "Calendly"}
  {lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration}m` : ""}
  {lead.meetingDate ? ` · ${(() => { try { return format(parseISO(lead.meetingDate), "MMM d, h:mm a"); } catch { return ""; } })()}` : ""}
</span>
```

This produces: `Introductory Call · 25m · Apr 2, 2:00 PM`

Also remove `truncate` class to prevent clipping (replace with `whitespace-nowrap`).

## Files Changed
| File | Change |
|------|--------|
| `src/components/LeadsTable.tsx` | Add formatted meeting date/time to table row Calendly info (line 1233) |

