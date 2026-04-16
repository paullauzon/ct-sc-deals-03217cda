

# LinkedIn Enrichment: End-to-End Verification — Bugs Found

## Test Results

I deployed `backfill-linkedin` and ran it against Woody Cissel (CT-200) twice. Both failed with the same two bugs.

## Bug 1: Firecrawl v2 Response Format Mismatch

**Error**: `TypeError: results.map is not a function` at line 65 (inside `firecrawlSearch`)

**Cause**: The v2 `/search` endpoint was introduced but the response may not always be an array. The code does `data.data || data.results || []` — but Firecrawl v2 search returns `{ success: true, data: [ ... ] }` when working, but can also return `{ success: true, data: { ... } }` (an object, not array) in edge cases or when the query returns metadata. Need to guard with `Array.isArray()`.

**Fix** (line 98 in `backfill-linkedin/index.ts`):
```typescript
const raw = data.data || data.results || [];
const results = Array.isArray(raw) ? raw : [];
```

## Bug 2: OpenAI 429 — No Retry Logic on AI Calls

**Error**: `Error: OpenAI HTTP 429` in `callAI` — kills both rationalization and the agent loop immediately.

**Cause**: The `callAI` function (line 202) throws immediately on any non-2xx status with no retry. OpenAI 429s are common and transient. We added retry logic for Firecrawl 429s but not for OpenAI.

**Fix** (`callAI` function): Add a simple retry with exponential backoff (1 retry after 2s delay on 429).

```typescript
async function callAI(messages, openaiKey, model): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", { ... });
    if (res.status === 429 && attempt === 0) {
      console.warn("OpenAI 429 — retrying in 3s...");
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }
  throw new Error("OpenAI 429 after retry");
}
```

## What's Working (Verified)

| Component | Status |
|---|---|
| Auto-trigger from `ingest-lead` | Correct — passes `{ leadId }` via `Promise.allSettled` |
| Manual URL paste in Deal Room | Code present, correctly calls `backfill-linkedin` with `manualUrl` |
| "Search Again" button in Deal Room | Code present, clears URL then re-invokes |
| LinkedIn coverage stats in LeadsTable | Code present, shows `(found/total)` on button |
| Company cache infrastructure | Code present, `CompanyCache` Map created in batch mode |
| Cross-lead mining | Code present in Strategy A |
| Fuzzy company matching | Code present in quick-match |
| Batch auto-continuation | Code present, chains up to 3 runs |

## What's Broken (Must Fix)

| Bug | Impact |
|---|---|
| Firecrawl v2 response parsing | All Firecrawl searches fail silently — the primary search engine is dead |
| OpenAI 429 with no retry | Rationalization fails, agent fails after 1 turn — entire enrichment pipeline is broken |

## Plan

### Step 1: Fix `firecrawlSearch` response parsing
Add `Array.isArray()` guard on the response data.

### Step 2: Add OpenAI 429 retry to `callAI`
Simple 1-retry with 3s backoff on 429.

### Step 3: Redeploy and retest
Deploy `backfill-linkedin`, run on CT-200 (Woody Cissel), CT-219 (Ramesh Dorairajan), and CT-222 (Erik Ott) to verify end-to-end.

## Files to Change
- `supabase/functions/backfill-linkedin/index.ts` — two targeted fixes (response parsing + retry logic)

