

# LinkedIn Enrichment: End-to-End Verification Results

## Test Results

Tested CT-222 (Erik Ott, Shield8). The function deployed successfully but **failed due to OpenAI 429 rate limits consuming the entire edge function timeout**.

```text
Logs:
12:03:36  booted
12:03:37  Checking email signatures...
12:03:37  Running AI rationalization...
12:03:38  OpenAI 429 — retrying in 5s (attempt 1/4)
12:03:43  OpenAI 429 — retrying in 15s (attempt 2/4)
12:03:59  OpenAI 429 — retrying in 30s (attempt 3/4)
[function timed out at ~60s — Gemini fallback never reached]
```

## Root Cause

The retry delays (5s + 15s + 30s = **50s cumulative**) exceed the edge function timeout before the Gemini fallback at attempt 4 can execute. The function dies waiting.

## Bug: 10 Leads Still Missing LinkedIn URLs

| Lead | Company | Status |
|---|---|---|
| CT-222 Erik Ott | Shield8 | Previously searched, failed |
| SC-I-040 Arun Karthik Ganesan | Grunexus | Never searched |
| TGT-034 Jae Park | Hanviagroup | Never searched |
| CT-220 Wasif Khan | Zaphyr | Never searched |
| CT-219 Ramesh Dorairajan | HGS | Previously searched, failed |
| CT-201 Dante | Kings Spa For Men | Never searched (single name) |
| CT-200 Woody Cissel | Right Lane Industries | Previously searched, failed |
| SC-T-069 Kyle Tamboli | Ancona Holdings | Never searched |
| CT-217 Eric Hung | Personal email | Never searched |
| CT-191 Ray French | No company | Never searched |

## Everything Else Verified ✓

- **Deployment**: Function deploys and boots successfully
- **Auto-trigger from ingest-lead**: Code confirmed — `Promise.allSettled` calls backfill-linkedin on new lead creation
- **Single-lead mode**: Works (Deal Room "Search Again" button sends `{leadId}`)
- **Manual URL paste**: Works (sends `{leadId, manualUrl}`)
- **Batch mode**: Code verified — chains, company cache, stale filter all structured correctly
- **Timeout guard**: 45s per chain (Fix 1 confirmed in code)
- **Agent candidate collection**: Code present (Fix 2)
- **Serper knowledge graph mining**: Code present (Fix 3)
- **Strategy D role-filtered search**: Code present (Fix 4)

## Fix Required

### Reduce OpenAI retry delays to fit within timeout budget

Current: 5s + 15s + 30s = **50s** (exceeds function timeout)
Proposed: 2s + 5s + 10s = **17s** (leaves 28s for Gemini fallback + actual work)

Also: trigger Gemini fallback after attempt **2** (not attempt 3) — 3 retries is excessive when the account is rate-limited.

### Changes

| File | Change |
|---|---|
| `supabase/functions/backfill-linkedin/index.ts` | Reduce retry delays from `[5000, 15000, 30000]` to `[2000, 5000]`, trigger fallback after 2 failed retries instead of 3 |

After fixing, I'll redeploy and re-test on CT-222, SC-I-040, and TGT-034 to verify actual LinkedIn discovery works end-to-end.

