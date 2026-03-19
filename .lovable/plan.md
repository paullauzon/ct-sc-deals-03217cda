

# Investigation: Missing Leads from Zapier Push

## Summary
After cross-referencing all 4 form CSVs against the database, **3 leads from the last 30 days are confirmed missing** from the system. Additionally, there are 2 data quality issues.

---

## Missing Leads (never reached the database)

| # | Name | Email | Form | Date | Likely Cause |
|---|------|-------|------|------|-------------|
| 1 | **Cortney Park** | cpark@hamptonrock.com | CT Contact Form | 03/10/2026 | Multi-line message with quotes and line breaks |
| 2 | **Valentine Moroz** | Valentine@softinway.com | CT Free Targets Form | 03/04/2026 | Multi-line target criteria with special chars |
| 3 | **Amber Tobias** | atobias@2x.marketing | CT Free Targets Form | 03/18/2026 | Extremely long multi-line criteria (~15 lines) with colons, parens, slashes |

### Root Cause Analysis

All 3 missing leads share a common pattern: **their form submissions contain long, multi-line text with special characters** (nested quotes, line breaks, colons, parentheses). Other leads submitted on the same days from the same forms DID arrive, so Zapier itself was running — the issue is almost certainly that Zapier's JSON serialization of these specific payloads either:

1. **Broke the JSON** — unescaped newlines or quotes in the message/criteria field produced invalid JSON that the `ingest-lead` edge function rejected with a parse error
2. **Zapier truncated/errored silently** — Zapier may have hit a field length limit or encountered a mapping error on these specific rows and skipped them without retry

The edge function logs have rotated (no historical logs available), so we can't confirm the exact failure point, but the pattern is clear.

### What didn't cause it
- The internal employee filter (none of these are internal emails)
- The deduplication logic (none exist in the DB at all)
- Database schema issues (other leads from the same forms/dates succeeded)

---

## Data Quality Issues Found

1. **Leading whitespace in emails**: `koberg@awayday.com` and `tim.murray@conniehealth.com` were stored with leading spaces in the email column, likely from Zapier sending whitespace-padded values. The `ingest-lead` function trims emails but only on new leads — the Zapier payload may have spaces before the field itself.

2. **Mixed-case emails**: `Timur.Grinevic@bearstoke.com` and `Ben.griffith@GMAXind.com` are stored with original casing, suggesting they were seeded from hardcoded data (the seed path doesn't lowercase) rather than ingested via Zapier.

---

## Recommended Fix Plan

### 1. Manually ingest the 3 missing leads
Call the `ingest-lead` edge function directly for each of the 3 missing leads with properly escaped payloads. No code changes needed — just API calls.

### 2. Harden the ingest function against malformed input
- Add try/catch around `req.json()` with a more descriptive error log
- Sanitize/trim all string fields (strip leading/trailing whitespace, normalize newlines)
- Add explicit logging of the raw request body on parse failure so future drops are diagnosable
- Add a `console.log` breadcrumb at entry with the email being processed

### 3. Fix existing whitespace emails
Run a DB migration to trim leading/trailing whitespace from all email values:
```sql
UPDATE leads SET email = TRIM(email) WHERE email != TRIM(email);
```

### 4. Add Zapier webhook monitoring (optional)
Add a simple `ingest_log` table that records every ingest attempt (email, status, timestamp) so you can cross-reference form submissions against actual API hits without relying on edge function log retention.

