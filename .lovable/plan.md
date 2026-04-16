
# Fix why Woody Cissel still is not enriching

## What I found in the code

The most likely blocker is not the nickname logic anymore.

The main Leads toolbar is calling:

```ts
supabase.functions.invoke("backfill-linkedin", { body: { retry_failed: true } })
```

But in `backfill-linkedin`, `retry_failed: true` means:

```ts
leadsQuery = leadsQuery.eq("linkedin_url", "")
```

So that batch button only processes leads already marked as failed (`linkedin_url = ""`), not leads that are still missing LinkedIn (`linkedin_url is null`).

That means:
- the “LinkedIn Enrich” button label is misleading
- “Enrich Missing” is also currently wrong
- “Re-enrich Stale” is also wrong because it still uses `retry_failed: true`
- Woody may simply not be entering the batch pipeline at all unless manually retried from Deal Room

There is also a second possible issue:
- Preview and Live use separate backend data, so Woody may have been fixed in one environment but not the other

## Plan

### 1) Fix the toolbar actions so they hit the correct backfill modes
Update `src/components/LeadsTable.tsx`:

- **LinkedIn Enrich** → call `backfill-linkedin` with no `retry_failed`
- **Enrich Missing** → same: process `linkedin_url is null`
- **Re-enrich Stale** → call with `minAge: 30` and no `retry_failed`
- If we still want a failed-only retry flow, add a clearly named option like:
  - `Retry Failed Only`

This is the biggest functional bug I found.

### 2) Make the response/toasts match the real function output
The UI is reading `data.results`, but `backfill-linkedin` batch mode returns:
- `processed`
- `found`
- `gaveUp`
- `gaveUpReasons`
- `chainsRun`

Update the success messages to use the actual payload so results are truthful.

### 3) Add one explicit single-lead retry path in the table
Keep Deal Room single-lead retry, but also expose a crystal-clear per-lead/manual retry path for cases like Woody.
That prevents batch ambiguity and makes debugging specific misses much easier.

### 4) Verify Woody in both environments
Check whether Woody exists in:
- Preview backend
- Live backend

Because code deploys everywhere, but the lead records do not sync automatically across environments.

### 5) Run a focused end-to-end verification for Woody
After the UI fix:
- trigger single-lead enrichment for Woody
- confirm the function now includes him in the correct mode
- inspect logs for the exact search/verification path
- confirm whether the nickname-aware path now lands on the William/Woody profile and writes `linkedin_url`

## Files likely affected

- `src/components/LeadsTable.tsx`
- possibly `src/pages/DealRoom.tsx` only if we want to align labels/messages
- `supabase/functions/backfill-linkedin/index.ts` only if logs reveal another backend miss after the UI fix

## Technical notes

Current mismatch:

```text
UI label: Enrich Missing
Actual request: retry_failed: true
Actual backend behavior: only linkedin_url = ""
Expected behavior: linkedin_url is null
```

So the most probable explanation is:
```text
Woody still not enriched because the button you are using is not targeting missing leads.
```

If you approve, I’ll fix the toolbar calls, align the success states with real backend output, then verify Woody specifically end to end in the correct environment.
