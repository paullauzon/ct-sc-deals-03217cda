

# Remove "Long Term Follow Up" Stage & Import CSV "Lost & Long Term Follow Ups" as "Lost"

## What the user wants

1. **Remove** the "Long Term Follow Up" stage entirely from the system
2. **Import** all CSV rows with stage "Lost & Long Term Follow Ups" into our "Lost" stage — with the same full data enrichment treatment (notes, LinkedIn, secondary contacts, billing, Pipedrive context, etc.) that Revisit/Reconnect leads received
3. Confirm all existing Revisit/Reconnect imports are complete

## Current state

- **280 leads** in Revisit/Reconnect (imported and enriched)
- **2 leads** in Lost (pre-existing)
- **0 leads** in Long Term Follow Up
- CSV has "Lost & Long Term Follow Ups" stage rows that were **never imported** (the original script only targeted Revisit/Reconnect)

## Implementation

### Step 1: Remove "Long Term Follow Up" from the codebase

Files to edit:
- `src/types/lead.ts` — remove from `LeadStage` union
- `src/components/Pipeline.tsx` — remove from `ALL_STAGES` and `CLOSED_STAGES`
- `src/components/LeadsTable.tsx` — remove from `STAGES`
- `src/components/IntelligenceCenter.tsx` — remove from stage order array
- `src/contexts/LeadContext.tsx` — remove from stage list
- `src/lib/playbooks.ts` — remove the "long-term-follow-up" playbook

### Step 2: Import "Lost & Long Term Follow Ups" CSV rows into "Lost"

Python script via `code--exec` that:
- Parses the full CSV with proper multi-line field handling
- Filters rows where Stage = "Lost & Long Term Follow Ups"
- For each row, either matches an existing DB lead by email (update) or creates a new lead with `CT-` prefix
- Sets `stage = 'Lost'`
- Maps all fields identically to the Revisit/Reconnect import: name, email, company, deal value, owner, LinkedIn, website, secondary contacts, service interest, EBITDA/revenue, referral source, meetings, contract data
- Appends "Pipedrive Context" block to notes with: Firm Type, Next Steps, Onboarding Guide, Deal Term, Credit Details, EBITDA
- Folds the full CSV Description into notes (this contains the "why they didn't buy" narrative)

### Step 3: Update memory

Update `mem://features/pipeline-workflow` to reflect 12 stages (Long Term Follow Up removed).

### Step 4: Verify

Query DB to confirm all "Lost & Long Term Follow Ups" rows are now in the Lost stage with complete data.

