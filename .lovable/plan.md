

# Fix: Deal Intelligence Synthesis Failure

## Root Cause

Two issues are causing the failure:

1. **Payload too large**: `synthesizeDealIntelligence` in `bulkProcessing.ts` sends the **full meetings array including entire transcripts** to the edge function. The edge function then re-includes up to 3000 chars per transcript in its prompt. For leads with multiple long transcripts, this can exceed the AI gateway's token/payload limits, resulting in a 500 error.

2. **No retry on transient failures**: The AI gateway occasionally returns 500 (visible in edge function logs: `"No tool call in response: {"error":{"message":"Internal Server Error","code":500}}"`). There's no retry logic, so a single transient failure kills the entire synthesis.

3. **React crash after error**: The toast "Failed to synthesize deal intelligence" fires, but then the React error overlay appears. This is likely caused by a downstream render issue — when the `updateLead` call succeeds (meetings saved) but `dealIntelligence` remains stale/undefined, `DealIntelligencePanel` may attempt to render data that doesn't match expectations after the meetings array changed.

## Fix Plan (3 files)

### 1. `src/lib/bulkProcessing.ts` — Strip transcripts before sending
In the `synthesizeDealIntelligence` function, strip the `transcript` field from each meeting before sending to the edge function. The edge function already reads transcripts from the request body — but we should only send the first 3000 chars per meeting (matching what the edge function uses), dramatically reducing payload size. Also add a single retry on 500 errors.

### 2. `src/components/MeetingsSection.tsx` — Same transcript stripping
The local `synthesizeDealIntelligence` function (used for manual meeting add/remove) also sends full meetings. Apply the same transcript trimming. Also wrap the `DealIntelligencePanel` rendering in a try/catch boundary or add null-safety guards to prevent React crashes when deal intelligence data is partially formed.

### 3. `src/contexts/ProcessingContext.tsx` — Graceful error handling
The catch block at line 319 silently logs the error. Add a `toast.error` so the user knows it failed (matching MeetingsSection behavior), and ensure the lead's `dealIntelligence` isn't left in an inconsistent state.

### Technical Details

**Transcript stripping** (applied in both `bulkProcessing.ts` and `MeetingsSection.tsx`):
```typescript
const trimmedMeetings = meetings.map(m => ({
  ...m,
  transcript: m.transcript ? m.transcript.substring(0, 3000) : "",
}));
```

**Retry logic** in `synthesizeDealIntelligence`:
```typescript
for (let attempt = 0; attempt < 2; attempt++) {
  const { data, error } = await supabase.functions.invoke(...);
  if (!error) return data?.dealIntelligence || null;
  if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
  throw error;
}
```

