

# Fix: Set sourceBrand on auto-found meetings

## Issue
In `handleAutoFind`, meetings found from the parallel brand search don't have `sourceBrand` set. The CT/SC badge on meeting cards won't render.

## Fix

### `src/components/MeetingsSection.tsx`
Track which brand each meeting came from during the merge step. Tag ctMeetings with `sourceBrand: "Captarget"` and scMeetings with `sourceBrand: "SourceCo"` before merging and deduplicating.

```typescript
const ctMeetings = (ctResult.data?.meetings || []).map(m => ({ ...m, sourceBrand: "Captarget" }));
const scMeetings = (scResult.data?.meetings || []).map(m => ({ ...m, sourceBrand: "SourceCo" }));
```

Then use `m.sourceBrand` when constructing the `Meeting` object (line ~127).

| File | Change |
|------|--------|
| `src/components/MeetingsSection.tsx` | Tag meetings with sourceBrand during merge, pass to Meeting object |

