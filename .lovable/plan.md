

# Move LinkedIn Icon Next to Lead Name

## Change

Move the LinkedIn icon from Row 4a (where it's cramped between "days in stage" and meeting outcome) to Row 1, right after the lead's name. This declutters Row 4a and places LinkedIn where it's most useful — next to the person's identity.

## Implementation

**`src/components/Pipeline.tsx`**:

1. **Row 1 (name line, ~line 334)**: Add the LinkedIn icon after the name (and after the NEW badge if present), inline in the same flex row
2. **Row 4a (~lines 372-381)**: Remove the LinkedIn link block entirely, leaving just "days in stage" and meeting outcome — much cleaner

