

# Import Legacy CRM Deals into Revisit/Reconnect

## CSV Overview
~200+ deals from the old CRM (Pipedrive-style export). Multi-line descriptions, varied stages ("Revisit/ Reconnect", "In Contact", "To Contact", "Lost & Long Term Follow Ups", "Automation Live", etc.).

## Field Mapping: What Maps Directly

| CSV Column | → Lead Field | Notes |
|---|---|---|
| Primary Contact Name | `name` | |
| Primary Contact Email | `email` | |
| Title / Account | `company` | Use Account if present, else Title |
| Value | `dealValue` | Parse `$2,000.00` → 2000 |
| Owner Name | `assignedTo` | Map "Malik Hayes" → "Malik", "Valeria Rivera" → "Valeria" |
| Description | `notes` | |
| Created | `dateSubmitted` / `createdAt` | |
| Next Action Date | `nextFollowUp` | |
| Service | `serviceInterest` | Map to closest enum value |
| Lead Source | `source` | Store raw value |
| Website | `companyUrl` | |
| Referred By | `hearAboutUs` | |
| EBITDA/Revenue/$ | `targetRevenue` | |
| First Payment Date | `contractStart` | |
| Contractual End Date | `contractEnd` | |
| Contract Billing Amount | `subscriptionValue` | |
| IntroCall Date/Time | `meetingDate` | |
| Last Engaged Date | `lastContactDate` | |
| Main LinkedIn Profile | `linkedinUrl` | |
| FireFlies Notetaker | `firefliesUrl` | |
| Firm Type | `buyerType` | |
| Deal ID | stored in notes or skip | For reference |
| Stage | All imported as `"Revisit/Reconnect"` per your request |

## Fields That Need a Decision

### Recommend NEW columns (genuinely useful for CRM ops):

1. **`secondary_contacts`** (jsonb) — e.g. `[{email: "...", name: "..."}]`. You have leads with 2-3 secondary contacts. This is real CRM data you'll want to reference during deals.

2. **`google_drive_link`** (text) — Several deals have Drive links to proposals/contracts. Useful reference.

3. **`forecasted_close_date`** (text) — Different from forecast *category*. Actual target date for closing.

### Recommend SKIP (fold into `notes` or ignore):

| CSV Column | Recommendation |
|---|---|
| Credit Details | Append to `notes` — rare, free-text |
| Deal Term | Append to `notes` |
| Contract Term | Append to `notes` (or map to `billingFrequency` where clear) |
| Onboarding Guide Attached | Skip — operational status, not lead data |
| Next Steps | Append to `notes` |
| Account Status | Skip |
| SourceCo Email | Skip — internal routing |
| FireFlies Kick-Off Call | Store as a second entry in `meetings[]` array |

### Definitely SKIP (IDs, system fields):

Stage ID, Contact ID, Account ID, Owner ID, Pipeline ID, Owner Email/Username, Currency (all USD)

## Import Approach

1. **Add 3 new DB columns** via migration: `secondary_contacts` (jsonb), `google_drive_link` (text), `forecasted_close_date` (text)
2. **Update type definitions** and mapping functions for new fields
3. **Write a one-time import script** (edge function or exec) that:
   - Parses the multi-line CSV properly
   - Deduplicates against existing leads by email
   - For existing leads: appends notes, updates stage to "Revisit/Reconnect"
   - For new leads: generates IDs with `CT-` prefix, sets stage to "Revisit/Reconnect"
   - Maps all fields per the table above
   - Folds unmapped fields into `notes` with clear labels
4. **Run the import** against the correct environment

## Estimated scope
- 1 migration (3 columns)
- 3 file edits (types, leadDbMapping, LeadContext or similar)
- 1 import script (Python via exec, parsing CSV → insert/upsert to DB)

