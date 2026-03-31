

# Show Calendly Meeting Info in Lead Panel Header

## Problem
When a lead has a scheduled meeting, the Calendly booking details only appear far down in the "Meeting" section. It should also appear right below the role/company line in the panel header for immediate visibility.

## Change in `src/components/LeadsTable.tsx`

After line 232 (`<p className="text-sm text-muted-foreground">{lead.role} · {lead.company || "No company"}</p>`), add a conditional line that shows when `lead.calendlyBookedAt` exists:

```tsx
{lead.calendlyBookedAt && (
  <p className="flex items-center gap-1.5 text-xs text-primary font-medium mt-0.5">
    <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
    {lead.calendlyEventName || "Calendly Meeting"}
    {lead.calendlyEventDuration ? ` · ${lead.calendlyEventDuration} min` : ""}
    {lead.meetingDate ? ` · ${(() => { try { return format(parseISO(lead.meetingDate), "EEE, MMM d 'at' h:mm a"); } catch { return lead.meetingDate; } })()}` : ""}
  </p>
)}
```

This mirrors the same format used in the DealRoom header.

## Files Changed
| File | Change |
|------|--------|
| `src/components/LeadsTable.tsx` | Add Calendly meeting line after role/company in side panel header |

