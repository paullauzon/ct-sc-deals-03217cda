

# Plan: Clean Up Employees + Retry Failed Leads

## 1. Delete 3 employee records from `leads` table
Remove Valeria Rivera (CT-037), Myall Budden (SC-T-023), and Adam Haile (TGT-021) from both the `leads` table and their associated `processing_jobs` entries.

```sql
DELETE FROM processing_jobs WHERE lead_id IN ('CT-037', 'SC-T-023', 'TGT-021');
DELETE FROM leads WHERE id IN ('CT-037', 'SC-T-023', 'TGT-021');
```

## 2. Clean up failed processing_jobs for the remaining 9 leads
Reset them so they can be retried:
```sql
DELETE FROM processing_jobs WHERE status = 'failed' AND lead_id NOT IN ('CT-037', 'SC-T-023', 'TGT-021');
```

## 3. Add timeout protection to `run-lead-job` edge function
The root cause of all 12 failures is the edge function hitting Deno's execution time limit. Two fixes:

- **Cap Fireflies results at 20 meetings** — prevents cases like Valeria Rivera (107 meetings) from ever reaching the AI loop
- **Add per-meeting timeout** — if a single `process-meeting` call takes >25 seconds, skip it and continue to the next meeting rather than killing the whole job

### Files
| File | Change |
|------|------|
| Database migration | Delete 3 employee records + clean up failed jobs |
| `supabase/functions/run-lead-job/index.ts` | Cap meetings at 20, add per-meeting timeout handling |

