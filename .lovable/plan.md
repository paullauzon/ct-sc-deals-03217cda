

# Redesign "Pending Actions" as a Distinct Action Button on Pipeline Cards

## The Problem

The "3 pending actions · Follow-up Mar 24" line is styled identically to other muted metadata text on the card. It blends in and doesn't read as something clickable or actionable. Users need a visual cue that this is a call-to-action, not just informational text.

## What Gets Built

Replace the plain text line with a compact, button-like element that clearly communicates "this is an action you should take":

- **Container**: Small pill/chip with a subtle border (`border border-border`) and light background (`bg-secondary/50`), separated from the metadata badges above with a small gap
- **Layout**: `[count] pending actions · Follow-up Mar 24  →`
- **Arrow**: Always visible (not just on hover) as a `ChevronRight` icon at the end — this is the strongest "clickable" affordance
- **Hover state**: Background darkens slightly (`hover:bg-secondary`), smooth transition
- **Typography**: `text-[10px] font-medium` — slightly bolder than surrounding text to stand out
- **Spacing**: Add `mt-1` to visually separate it from the badge row above, making it its own distinct element rather than another line of metadata

For the "doNext" fallback (when no dropped promises), apply the same chip treatment so it's consistent.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Restyle the action summary div (lines 455-468) from plain text to a bordered pill/chip with always-visible ChevronRight arrow. Same treatment for doNext fallback (lines 470-478). |

