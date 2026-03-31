

# Auto-Detect Brand from Calendly Event Name

## How It Works
Calendly event names contain the brand: "SourceCo Intro" vs "CAPTARGET Intro". We parse the event name and set the lead's `brand` field accordingly — but only if the lead doesn't already have a definitive brand set from form submission.

## Logic
```text
Event name contains "sourceco" (case-insensitive) → brand = "SourceCo"
Event name contains "captarget" (case-insensitive) → brand = "Captarget"
Otherwise → no change
```

## Changes

### 1. `supabase/functions/ingest-calendly-booking/index.ts`
- Extract `eventName` (already parsed on line 68)
- Detect brand from event name using case-insensitive match
- Include `brand` in the update payload when detected

### 2. `supabase/functions/backfill-calendly/index.ts`
- Same brand detection from the Calendly event `name` field
- Include `brand` in the update payload for matched leads
- Re-run with `?force=true` to stamp brands on all existing leads

| File | Change |
|------|--------|
| `supabase/functions/ingest-calendly-booking/index.ts` | Detect brand from event name, set on lead |
| `supabase/functions/backfill-calendly/index.ts` | Same brand detection for backfill |

