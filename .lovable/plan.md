

# Complete LinkedIn Backfill + Auto-Enrich New Leads

## Step 1: Reset failed leads and run backfill to completion

- Reset the 7 leads with `linkedin_url = ''` back to `NULL`
- Invoke `backfill-linkedin` repeatedly (5 leads per run, ~12 runs needed for 58 leads) until 0 remain
- Report final stats: matched vs genuinely not found

## Step 2: Add single-lead support to `backfill-linkedin`

Modify the edge function to accept an optional `leadId` parameter in the request body. When provided, it processes only that one lead instead of querying for all NULL leads. This makes it usable as a real-time enrichment trigger.

## Step 3: Auto-trigger LinkedIn enrichment on new lead ingestion

In `supabase/functions/ingest-lead/index.ts`, add a fire-and-forget call to `backfill-linkedin` (same pattern as the existing `score-lead` trigger), passing the new lead's ID. This way, the moment a lead is created, its LinkedIn profile is found automatically.

### Changes summary
| File | Change |
|------|--------|
| `supabase/functions/backfill-linkedin/index.ts` | Accept optional `{ leadId }` body param; when set, process only that lead |
| `supabase/functions/ingest-lead/index.ts` | Add fire-and-forget call to `backfill-linkedin` with new lead ID after creation |
| Database | `UPDATE leads SET linkedin_url = NULL WHERE linkedin_url = '';` to reset failed leads |

