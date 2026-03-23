

# Fix JSON Parse Failures in ingest-lead + Recover Prit Lavani

## Root Cause
Zapier sends form field values containing literal newline characters (`\n`, `\r`) inside JSON string values. This is invalid JSON — newlines inside strings must be escaped as `\\n`. Our `ingest-lead` function does a raw `JSON.parse()` which fails on these payloads. This is **our bug**, not Zapier's.

## Changes

### 1. Fix `ingest-lead` to handle multi-line payloads

In `supabase/functions/ingest-lead/index.ts`, before `JSON.parse(rawText)`:
- Sanitize the raw text by escaping literal newlines/carriage returns that appear inside JSON string values
- Use a regex to replace unescaped `\n` and `\r` within strings with `\\n` and `\\r`
- This makes the JSON valid before parsing, handling any multi-line form field from Zapier

### 2. Manually ingest Prit Lavani

Using the data visible in the error log:
- **name**: Prit Lavani
- **email**: plavani19@gmail.com
- **brand**: Captarget
- **source**: CT Free Targets Form
- **role**: Independent Sponsor / Search Fund
- **companyUrl**: www.p
- **targetCriteria**: Manufacturing business criteria (NJ, NY, PA, FL, $4M-$8M revenue, $500K+ EBITDA, Food/Defense/Medical/Electronics/Packaging)

Insert via database migration, then trigger scoring and LinkedIn enrichment.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/ingest-lead/index.ts` | Sanitize raw body to escape literal newlines before `JSON.parse()` |
| Database migration | `INSERT` Prit Lavani lead record |

