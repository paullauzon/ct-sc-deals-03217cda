

# Manually Ingest Brian Steel / Catskill Partners Lead

## Context
The lead was submitted via the SC Free Targets Form but hit a JSON parse error in the `ingest-lead` edge function (visible in logs). The payload never made it to the database.

## What to Do

### 1. Insert the lead directly into the database
Using the data from the edge function error log and the user's screenshot:

- **ID**: `SC-T-060` (next after SC-T-059)
- **brand**: SourceCo
- **source**: SC Free Targets Form
- **name**: Brian Steel
- **email**: brian.steel@catskillpartners.com
- **phone**: 9522127249
- **company**: Catskill Partners
- **role**: Private Equity
- **currentSourcing**: "Internal BD team, Buy-side firm(s), Manual outreach (Grata, Pitchbook, LinkedIn, etc.)"
- **acquisitionStrategy**: "We're mid-process on 1–2 deals"
- **message**: (from screenshot — the LMM / $2-20M EBITDA / Advanced Manf. text)
- **stage**: New Lead
- **date_submitted**: 2026-03-20 (date from log timestamp)

Insert via a database migration with an `INSERT` statement, including a proper `submissions` JSONB array with the form data.

### 2. Trigger scoring and enrichment
After insert, invoke `score-lead` and `backfill-linkedin` edge functions for this lead so it gets the same treatment as any normally ingested lead.

### Files Changed
| File | Change |
|------|--------|
| Database migration | `INSERT` the Brian Steel lead record |

Post-migration: manually invoke `score-lead` and `backfill-linkedin` for lead `SC-T-060`.

