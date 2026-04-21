

# Lead audit cleanup — skip the 2 missing leads, harden against future noise

You confirmed Vernon Coleman and Valeria Rivera are not real opportunities, so we're skipping the backfills. Two small cleanups remain to keep the pipeline clean and prevent recurrence.

## What I'll do

### 1. Block Valeria Rivera's personal Gmail from future submissions

Add `valeriarivera31@gmail.com` to the `EXCLUDED_EMAILS` list in `supabase/functions/ingest-lead/index.ts`. She's already on the internal-employee exclusion list under her work email, but her personal Gmail wasn't covered — if she tests the form again, it'd land in the dashboard. One-line addition.

### 2. Archive `TGT-021` (Adam Haile internal test)

This row predates the `adam.haile@sourcecodeals.com` exclusion filter, so it's currently sitting in the active SourceCo pipeline as a `New Lead`. Archive it with reason `"Internal test submission — predates exclusion filter"` so it stops appearing in pipeline counts, follow-up queues, and dashboards.

## What I'm explicitly NOT doing (per your call)

- **Vernon Coleman backfill** — skipped. Not an M&A opportunity.
- **Ingest-failure hardening** (the `ingest_failures` table + lenient fallback parser) — deferring. Historical loss rate is ~1% and both losses this round were noise anyway. We can revisit if real opportunities ever start dropping.
- **SourceCo CSVs** — not uploaded this turn, so not audited. If you want a full SC audit, upload those CSVs and I'll run the same comparison.

## Files touched

- `supabase/functions/ingest-lead/index.ts` — add `valeriarivera31@gmail.com` to `EXCLUDED_EMAILS`
- One SQL update on `leads` table — set `archived_at = now()` and `archive_reason = 'Internal test submission — predates exclusion filter'` where `id = 'TGT-021'`

## After this build

- Future Valeria Rivera test submissions from her personal Gmail are silently dropped at the ingest edge — no dashboard noise
- `TGT-021` disappears from the active SourceCo pipeline, follow-up queues, and dashboard counts but is preserved in the database with a clear audit trail
- All 136 real CSV submissions remain accounted for and accurate

