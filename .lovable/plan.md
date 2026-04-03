

# De-Cramp Row 4: Separate Days, LinkedIn, and Meeting Info

## The Problem

Row 4 packs "22d in stage", LinkedIn icon, Calendly meeting details (name + duration + date), brand logo, Fireflies icon, meeting count, and meeting outcome all into a single `flex justify-between` row with `gap-1.5`. Everything collides visually.

## Solution: Split Into Two Rows

Break Row 4 into two distinct rows with clear separation:

**Row 4a — Stage & Status** (left-aligned, spaced):
- `22d in stage` with generous right margin
- LinkedIn icon (if present) with proper spacing
- Meeting outcome badge (e.g., "Held") — right-aligned

**Row 4b — Meeting Details** (only if Calendly booking exists):
- Full-width dedicated row for Calendly info: icon + event name + duration + date
- Brand logo + Fireflies meeting count on the right
- This gets its own line so nothing competes for horizontal space

### Spacing fixes:
- Row 4a: increase gap from `gap-1.5` to `gap-3` between days/LinkedIn/outcome
- Row 4b: slight indent or muted styling to show it's supplementary detail
- Both rows use consistent `text-xs text-muted-foreground`

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Split Row 4 into two rows — one for stage/LinkedIn/outcome, one for meeting details. Increase spacing between inline elements. |

