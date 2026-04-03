

# Split Meeting Line + Label Closing Insight

## Changes

### 1. Meeting details on two lines (`src/components/Pipeline.tsx`, ~lines 386-393)

Currently one cramped line: `📅 Introductory Call 25 min · Mar 4, 10:00 PM`

Split into:
- **Line 1**: CalendarCheck icon + event name (e.g., `Introductory Call`)
- **Line 2**: Duration + date/time, slightly indented (no icon), same `text-[10px] text-muted-foreground` styling

### 2. Label the closing insight with its source (`src/components/Pipeline.tsx`, ~lines 41-60 + 404-412)

Currently just: `"Lack of ownership and equity in previous ventures"` — a salesperson has no idea what this is.

**Update `getClosingInsight`** to return a `{ label: string, text: string }` where label is the insight type:
- Objections → `"Objection"`
- Pain points → `"Pain point"`
- Timeline → `"Timeline"`
- Sentiment → `"Signal"`

**Update the render** to show: `Objection: "Lack of ownership..."` — label in normal weight, quote in italic. This makes it instantly actionable.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Split Calendly meeting line into two rows. Add label field to `getClosingInsight` return type and display it as a prefix before the quoted text. |

