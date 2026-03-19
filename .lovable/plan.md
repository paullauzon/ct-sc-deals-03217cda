

# Fix Remaining Research & Recommend Issues

## Issues Found

### 1. AbortController is broken (CRITICAL)
The `handleEnrich` in `LeadsTable.tsx` creates an `AbortController` with a 55s timeout, but **never passes it to the fetch call**. `supabase.functions.invoke()` does not accept an `AbortSignal` parameter. The timeout fires `controller.abort()` into the void — the request continues indefinitely. Must switch to raw `fetch()` with the signal attached.

### 2. No enrichment status tracking
When enrichment starts, there's no `enrichmentStatus` update to "running". When it succeeds, no update to "complete". When it fails, no update to "failed". This means:
- No way to show a persistent loading state if the user closes/reopens the lead sheet
- No way to prevent double-clicking (starting two enrichments simultaneously)
- No audit trail of enrichment attempts

### 3. Edge function JSON.parse can throw unhandled
Line 326: `JSON.parse(toolCall.function.arguments)` — if OpenAI returns malformed JSON in the tool call arguments (happens occasionally with large outputs), this throws an unhandled error that returns a generic 500. Should be wrapped in try/catch with a specific error message.

## Fix Plan

### 1. Replace `supabase.functions.invoke` with raw `fetch` + AbortSignal
In `handleEnrich`, use `fetch` directly to call the edge function URL, passing the `AbortController.signal`. This makes the 55s timeout actually work.

### 2. Add enrichment status lifecycle
- Set `enrichmentStatus: "running"` before the call
- Set `enrichmentStatus: "complete"` on success
- Set `enrichmentStatus: "failed"` on failure
- Disable the enrich button when status is "running"

### 3. Add JSON.parse safety in edge function
Wrap `JSON.parse(toolCall.function.arguments)` in try/catch, return a clear error if parsing fails.

### Files Changed
- `src/components/LeadsTable.tsx` — raw fetch with AbortSignal, enrichment status updates
- `supabase/functions/enrich-lead/index.ts` — safe JSON.parse on tool call response

