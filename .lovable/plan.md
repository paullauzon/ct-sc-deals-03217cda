

# Backfill stage_entered_date for 3 manually ingested leads

## Issue
The 3 leads manually added earlier (CT-186 Cortney Park, TGT-024 Valentine Moroz, TGT-025 Amber Tobias) have empty `stage_entered_date`. Everything else across all 190 leads checks out.

## Fix
Run a single UPDATE to set `stage_entered_date = date_submitted` for leads where it's empty:

```sql
UPDATE leads SET stage_entered_date = date_submitted WHERE stage_entered_date = '' AND date_submitted != '';
```

This is a data-only fix — no code changes needed. Takes 2 seconds.

