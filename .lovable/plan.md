

# Fix Import Data Gaps & Enrich Notes with Full Deal Context

## Problems Found

### 1. Data corruption: `google_drive_link` column
Lisa Jefferson (CT-426) has target criteria text in `google_drive_link` instead of a Drive URL. The CSV parser misaligned columns on multi-line description rows.

### 2. Lost CSV columns — rich deal context not captured
These CSV fields were silently dropped during import:

| CSV Column | Data Examples | Count with Data |
|---|---|---|
| Next Steps | "Client Submitted a Buyers Profile", "No - Still Awaiting The Guide" | ~50+ |
| Deal Term | Contract length info | ~20+ |
| Credit Details | Amount and date of credit issuance | ~10+ |
| Account Status | Active/inactive flags | sparse |
| Onboarding Guide Attached | "Yes - Already Completed", "No - Still Awaiting The Guide" | ~30+ |
| FireFlies Kick-Off Call | Second Fireflies URL for kick-off meetings | ~15+ |
| SourceCo Email | Whether to use SourceCo branding for outreach | sparse |

### 3. `service_interest` mapping too aggressive
CSV values like "Origination Both Sides", "Off Market + Calling", "Full Market Email + Calling", "Origination Business Owners", "Origination Intermediaries" are being mapped to "Other" — losing the actual service detail.

### 4. `subscription_value` / `contract_start` / `contract_end` barely populated
Only 1 lead each for contract dates despite CSV having more data. The parser may be misreading these columns for multi-line rows.

## Fix Plan

### Step 1: Re-run import with corrected field mapping
Write a new Python script that:
- Uses proper CSV parsing (Python `csv` module with quoting) to handle multi-line descriptions correctly
- For each of the 280 imported leads (matched by email), **UPDATE** the following fields from CSV:
  - `google_drive_link` — only if CSV value looks like a URL (contains "drive.google" or "docs.google")
  - `contract_start` — from "First Payment Date (Jenni)"
  - `contract_end` — from "Contractual End Date"  
  - `subscription_value` — from "Contract Billing Amount" (parse number)
  - `service_interest` — store the raw CSV "Service" value directly (it's more useful than the forced enum mapping)

### Step 2: Append missing deal context to `notes`
For each lead, append a structured block at the end of existing notes:

```text
--- Pipedrive Context ---
Firm Type: Independent Sponsor
Next Steps: Client Submitted a Buyers Profile
Onboarding Guide: No - Still Awaiting The Guide
Deal Term: 6 months
Credit Details: $500 issued 03/15/2024
```

Only include fields that have non-empty values. This preserves the "why they didn't buy" and operational context without needing new DB columns.

### Step 3: Store kick-off call Fireflies URLs as meetings
Where "FireFlies Kick-Off Call" has a URL, add it as a second entry in the `meetings` jsonb array (with title "Kick-Off Call").

### Step 4: Fix service_interest values
Map CSV "Service" field to closest enum OR store as-is in notes if no match. The actual Pipedrive service names are more descriptive than our enum.

### Step 5: Verify data integrity
Query the DB after updates to confirm:
- `google_drive_link` only contains URLs (not text blobs)
- `notes` have the appended Pipedrive context
- Kick-off meetings are stored
- Contract/billing data is populated

## Technical approach
- Python script via `code--exec` using Supabase REST API
- Match existing leads by email (same as original import)
- UPDATE only — no new inserts needed
- Parse CSV with Python `csv.reader` to handle multi-line fields correctly

## No schema changes needed
All additional context goes into existing `notes` field. The 3 new columns (`secondary_contacts`, `google_drive_link`, `forecasted_close_date`) already exist.

