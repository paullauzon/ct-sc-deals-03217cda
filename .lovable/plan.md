

# Manually Insert Brad Shelton Lead

## Data (from screenshot)
- **Name**: Brad Shelton
- **Email**: brad.shelton@vestedgrowth.com
- **Company**: Vested Growth
- **Role**: Owner
- **Brand**: SourceCo
- **Source**: SourceCo Intro Form
- **Message**: "I'm looking for a buy-side partner to source and close a $1M acquisition using proprietary outreach. Do you work with individual buyers at that level?"
- **ID**: SC-I-036 (next in sequence)

## Changes

### 1. Database migration
Insert the lead record with today's date, stage "New Lead", and a submission record in the `submissions` JSONB array.

### 2. Trigger scoring
After insert, trigger `score-lead` and `backfill-linkedin` via the edge functions (same as `ingest-lead` does automatically).

| Action | Detail |
|--------|--------|
| DB migration | `INSERT INTO leads` for Brad Shelton |
| Edge function calls | Trigger `score-lead` + `backfill-linkedin` post-insert |

