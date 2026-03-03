

# Add Company Name as a Matching Signal

## Problem

Brady Blackett (`bblackett@atriumhomeservices.com`, company: "Atrium Home Services") has meetings in Fireflies but auto-find misses them. The meeting titles likely contain the company name ("Atrium") but not "Brady Blackett", and participant emails may differ.

Currently we search by: email, full name (with nicknames), email domain, and speaker names. But we never search by **company name** — one of the strongest and most reliable signals.

## Fix

### 1. Pass company name from auto-find (`MeetingsSection.tsx`)
Add `searchCompanies: [lead.company]` to the edge function call body (alongside existing signals).

### 2. Accept and match company name (`fetch-fireflies/index.ts`)
- Accept new `searchCompanies: string[]` param
- Add **Signal 5: Company name match** — check if any meaningful word from the company name (length >= 4, excluding generic words like "group", "capital", "partners", "services", "inc", "llc") appears as a word-boundary match in the meeting title
- For multi-word company names, require the **most distinctive word** (longest non-generic word) to match, not just any word
- Also check company name against participant names/emails

### 3. Also match company URL domain
The lead has `companyUrl: "https://atriumhomeservices.com/"` — extract the domain from this as a fallback signal if the email domain is generic. Add this in `MeetingsSection.tsx` when building `searchDomains`.

| File | Change |
|------|--------|
| `src/components/MeetingsSection.tsx` | Send `searchCompanies: [lead.company]`, extract domain from `companyUrl` as fallback |
| `supabase/functions/fetch-fireflies/index.ts` | Add company-name matching signal against title and participants |

This adds two new independent signals (company name + company URL domain) layered on top of the existing four, making it very unlikely to miss a real meeting.

