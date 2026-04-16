

# Import Audit & Next Steps

## Import Status: Complete and Healthy

All 290 CSV rows were processed (0 errors):
- **208 new leads** created (CT-223 → CT-430)
- **82 existing leads** updated (notes merged, stage moved)
- **280 total** in Revisit/Reconnect (includes some pre-existing leads that were already matched by email, like SourceCo/Target leads)

### Data coverage in Revisit/Reconnect:
| Field | Has Data | Missing |
|---|---|---|
| Email + Name | 280/280 | 0 |
| Deal Value | 223 | 57 |
| Notes | 262 | 18 |
| LinkedIn | 123 | **157** |
| Website | 172 | **108** |
| Fireflies URL | 97 | 183 |
| Secondary Contacts | 58 | — |
| Meetings (kick-off) | 43 | — |
| Owner/Assigned | 264 | 16 |
| Target Revenue | 85 | — |
| Referral Source | 75 | — |

Secondary contacts are parsing correctly (e.g. Calvin Lane → Salman Khan, Ben Schneider → Anthony Ekmekjian).

## What's Missing — Action Items

### 1. LinkedIn & Website Enrichment (biggest gap)
157 Revisit/Reconnect leads have no LinkedIn URL, 108 have no website. The existing `backfill-linkedin` function can fill these, but it processes 5 leads per run and would take many runs. We should:
- Run a targeted batch enrichment specifically for Revisit/Reconnect leads missing LinkedIn/website
- Potentially increase the batch size for this one-time backfill since we just need basic lookups, not deep scoring

### 2. Lead Scoring for Imported Leads
None of the 208 newly imported leads have `stage1_score`, `stage2_score`, or `tier` set. The enrichment pipeline (`enrich-lead-scoring`) should be triggered for these to get them properly scored and tiered.

### 3. Owner Assignment Gaps
16 leads have no `assigned_to`. These came from CSV rows where `Owner Name` was blank. We should assign them (likely to Malik as default, per existing patterns).

### 4. Duplicates Within Import
The script deduplicated by email within the CSV and against existing DB records. However, some imported leads may represent the same person with different emails (e.g., personal vs. company email). A quick audit could flag these.

### 5. Pipeline Memory Update
The `mem://features/pipeline-workflow` file still references "11 distinct stages" — needs updating to 13 stages with the new Revisit/Reconnect and Long Term Follow Up definitions.

## Implementation Plan

### Step 1: Assign unowned leads
Set `assigned_to = 'Malik'` for the 16 leads in Revisit/Reconnect with no owner.

### Step 2: Trigger LinkedIn/website enrichment batch
Run `backfill-linkedin` targeting the 157 Revisit/Reconnect leads missing LinkedIn. This will also pick up websites via the enrichment flow.

### Step 3: Trigger lead scoring
Run `backfill-lead-scores` for the newly imported leads (CT-223+) to populate tier/scoring.

### Step 4: Update pipeline memory
Update `mem://features/pipeline-workflow` to reflect the 13-stage workflow accurately.

### Step 5: Verify end-to-end in the UI
Open the pipeline, confirm Revisit/Reconnect column shows all 280 leads, click into a few to verify notes, LinkedIn, secondary contacts, and meetings render correctly.

All of this can be done in a single implementation pass — shall I proceed?

