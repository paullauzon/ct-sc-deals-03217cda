

# Fix Build Errors — 4 Files

## Root Cause
The `Lead` interface requires `stage1Score`, `stage2Score`, `tier`, `tierOverride`, and `enrichmentStatus` but the data factory functions in `leadData.ts` and `sourceCoLeads.ts` don't include them. Additionally, the DB migration for scoring columns was never applied, and `ingest-lead` has a typing issue.

## Changes

### 1. Add missing scoring fields to `src/data/leadData.ts`
In both lead factory locations (line 176 and line 255), add after `preScreenCompleted: false`:
```ts
stage1Score: null,
stage2Score: null,
tier: null,
tierOverride: false,
enrichmentStatus: "",
```

### 2. Add missing scoring fields to `src/data/sourceCoLeads.ts`
At line 83, add after `preScreenCompleted: false`:
```ts
stage1Score: null,
stage2Score: null,
tier: null,
tierOverride: false,
enrichmentStatus: "",
```

### 3. Fix `supabase/functions/ingest-lead/index.ts` typing
- Line 37: Change `supabase: ReturnType<typeof createClient>` to `supabase: any`
- This fixes both the `Property 'id' does not exist on type 'never'` and the argument type mismatch errors

### 4. New DB migration for scoring columns
Create migration adding the scoring columns that weren't applied from the previous migration file:
```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage1_score integer,
  ADD COLUMN IF NOT EXISTS stage2_score integer,
  ADD COLUMN IF NOT EXISTS tier integer,
  ADD COLUMN IF NOT EXISTS tier_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_status text,
  ADD COLUMN IF NOT EXISTS known_firm_match text,
  ADD COLUMN IF NOT EXISTS known_firm_domain_type text,
  ADD COLUMN IF NOT EXISTS pe_backed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pe_sponsor_name text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS website_score integer,
  ADD COLUMN IF NOT EXISTS pe_backed_stage2 boolean,
  ADD COLUMN IF NOT EXISTS portfolio_count integer,
  ADD COLUMN IF NOT EXISTS last_acquisition_year integer,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS linkedin_title text,
  ADD COLUMN IF NOT EXISTS linkedin_ma_experience boolean,
  ADD COLUMN IF NOT EXISTS linkedin_score integer,
  ADD COLUMN IF NOT EXISTS seniority_score integer;
```

This resolves all 4 build errors and the runtime "column does not exist" error from the backfill edge function.

