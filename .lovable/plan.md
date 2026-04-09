

# Fix: False-Positive Meeting Matching for Common First Names

## Root Cause

Eric Hung's lead has `company: "Eric Hung"` (same as his name). The Fireflies search filter builds "company words" by stripping generic terms, leaving `["eric", "hung"]`. It then picks `companyWords[0]` (which is `"eric"` or `"hung"`) and does a **single word-boundary match** against meeting titles.

Since `"eric"` is an extremely common first name, every Fireflies meeting with any "Eric" in the title matched — Eric Phan, Eric Lin, Eric Yetter, etc. All 7 meetings are for different people named Eric.

The same bug would affect any lead whose company name is identical to their personal name, or whose company name contains a very common word that also appears in unrelated meeting titles.

## Fix

### 1. Skip company-name matching when company equals lead name

In `fetch-fireflies/index.ts`, the `buildSearchFilter` function receives `searchCompanies`. In `run-lead-job/index.ts`, the company is passed as `lead.company`. When the company name is identical (or nearly identical) to the lead's name, the company signal adds zero new information — the name signal already covers it. Skip adding company words in this case.

### 2. Require ALL distinctive company words to match (not just the first)

Currently only `companyWords[0]` is checked. Change to require all distinctive words (or at least 2+ words for short company names) to match. This prevents single common words like "eric" from triggering false positives.

### 3. Skip company words that are common first/last names

Add a guard: if a company word is fewer than 5 characters and matches a common first name (from the existing nickname map keys or a small blocklist), skip it as a matching signal.

### 4. Clean up Eric Hung's bad meetings

Run a DB update to clear the incorrectly assigned meetings from CT-217.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/fetch-fireflies/index.ts` | In `buildSearchFilter`: (a) skip company matching when company equals a search name, (b) require multiple distinctive words to match instead of just one, (c) add common-name guard for short company words |
| `supabase/functions/run-lead-job/index.ts` | Pass `leadName` alongside `searchCompanies` so the filter can compare them |
| DB cleanup | Clear incorrect meetings from CT-217 (Eric Hung) |

