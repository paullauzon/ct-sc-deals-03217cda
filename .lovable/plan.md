

# Fix: LinkedIn Enrichment Not Triggering for New Leads

## Root Cause

The `ingest-lead` edge function uses **fire-and-forget** `fetch()` calls (lines 315 and 327) to trigger `score-lead` and `backfill-linkedin`. In Deno/Supabase Edge Functions, when the main handler returns a Response, the isolate can terminate before unawaited background fetches complete. This means **both enrichment calls are silently dropped** — the lead gets created but never enriched.

This explains why no logs appear for `backfill-linkedin` at all — the requests never actually reach it.

## Fix

**`supabase/functions/ingest-lead/index.ts`**: `await` both the `score-lead` and `backfill-linkedin` fetch calls before returning the response. Since both are independent, run them with `Promise.allSettled()` so failures in one don't block the other or the response.

Replace lines 312-336 (the two fire-and-forget fetches) with:

```typescript
// Trigger scoring + LinkedIn enrichment in parallel, await both before returning
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const [scoreResult, linkedinResult] = await Promise.allSettled([
  fetch(`${SUPABASE_URL}/functions/v1/score-lead`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ record: newLead }),
  }),
  fetch(`${SUPABASE_URL}/functions/v1/backfill-linkedin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ leadId }),
  }),
]);

if (scoreResult.status === "rejected") {
  console.error("Failed to trigger score-lead:", scoreResult.reason);
}
if (linkedinResult.status === "rejected") {
  console.error("Failed to trigger backfill-linkedin:", linkedinResult.reason);
}
```

This ensures both requests are sent and acknowledged before the function returns.

**Note**: `backfill-linkedin` itself can take minutes (AI agent with multiple turns). The `await` here only waits for the HTTP request to be **sent and accepted** (the edge function receives it), not for the full enrichment to complete — `backfill-linkedin` will continue processing in its own isolate.

## Files Changed
| File | Change |
|------|--------|
| `supabase/functions/ingest-lead/index.ts` | Replace fire-and-forget with `Promise.allSettled()` |

