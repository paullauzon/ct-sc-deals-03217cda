

# Strategy: Auto-Ingest Leads from Webflow via Zapier

## How It Works

```text
Webflow Form Submit
       │
       ▼
  Zapier Trigger
  (Webflow → New Form Submission)
       │
       ▼
  Zapier Webhook Action (POST)
       │
       ▼
  Edge Function: ingest-lead
  (validates, maps fields, inserts into DB)
       │
       ▼
  Leads table (Supabase)
       │
       ▼
  CRM auto-refreshes via existing data flow
```

## What We Build

### 1. New edge function: `ingest-lead`
- Accepts POST requests with form data from Zapier
- Maps Webflow form fields to the leads table schema
- Auto-detects brand (Captarget vs SourceCo) based on a `brand` field or the source form name sent by Zapier
- Auto-sets `source` based on form type (Contact Form, Free Targets Form, Intro Call Form)
- Generates a lead ID following existing conventions (e.g. `CT-XXX`, `SC-I-XXX`, `SC-T-XXX`)
- Checks for duplicates by email — if exists, appends to `submissions` array instead of creating a new lead
- Filters out internal employees (existing exclusion list)
- Protected by a shared secret (API key) to prevent unauthorized submissions
- Returns the created/updated lead ID

### 2. Zapier Setup (your side, no code)
For each of the 4 Webflow forms:
1. **Trigger**: Webflow → Form Submission (select the specific form)
2. **Action**: Webhooks by Zapier → POST to the edge function URL
3. Map Webflow fields → JSON body (name, email, phone, company, message, etc.)
4. Include `brand` ("Captarget" or "SourceCo") and `source` ("CT Contact Form", etc.) as static values per Zap
5. Include the API key in the header for authentication

### 3. Remove hardcoded lead data
Once the webhook is live and confirmed working, the static arrays in `src/data/leadData.ts` become unnecessary for new leads — all future leads flow in automatically.

## Technical Details

**Edge function endpoint**: `POST /ingest-lead`

**Expected payload**:
```json
{
  "brand": "Captarget",
  "source": "CT Contact Form",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "5551234567",
  "company": "Acme Corp",
  "companyUrl": "https://acme.com",
  "role": "Private Equity",
  "dealsPlanned": "3-10",
  "message": "Interested in deal sourcing",
  "targetCriteria": "",
  "targetRevenue": "",
  "geography": "",
  "currentSourcing": "",
  "hearAboutUs": "",
  "acquisitionStrategy": "",
  "buyerType": ""
}
```

**Auth**: `Authorization: Bearer <INGEST_API_KEY>` header — we'll generate a secret key and store it. You'll paste this same key into your Zapier webhook headers.

**Duplicate handling**: If a lead with the same email exists, the new submission is appended to the `submissions` JSONB array (preserving history, matching current behavior).

**ID generation**: Queries the DB for the highest existing ID with the relevant prefix and increments.

## What You'll Need to Do in Zapier

For each form (4 Zaps total):
1. Create a Zap with trigger "Webflow → New Form Submission"
2. Add action "Webhooks by Zapier → Custom Request (POST)"
3. Set URL to the edge function endpoint (I'll provide the exact URL)
4. Add header `Authorization: Bearer <key>` (I'll provide the key)
5. Map Webflow fields to the JSON body
6. Set `brand` and `source` as static values per Zap

