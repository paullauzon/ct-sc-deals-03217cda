

# Cross-Sync Company Associates & Intelligence

## The Problem
Connie Health has Tim Murray (Feb 25) and Eric Lin (Jan 27) — both from the same company but treated as completely independent leads. There's no visibility into:
- Other people from the same company who've inquired
- Meetings held with any company contact
- Combined intelligence across all company touchpoints

The existing `isDuplicate` flag only handles cross-brand (CT/SC) matches by email, not same-company grouping.

## What This Looks Like

### 1. Company Association Logic
Match leads by **normalized company domain** (extracted from `companyUrl` or `email` domain). E.g., `conniehealth.com` groups Tim Murray and Eric Lin together. Fallback: match by normalized `company` name for leads without URLs/emails.

### 2. Pipeline Cards — Company Badge
When a lead has associates at the same company, show a small indicator:
```
👥 2 contacts at this company
```
One line, below the existing source row. Clicking the card opens the detail where full context lives.

### 3. Lead Detail — "Company Activity" Section
New section in the LeadDetail panel (after Contact, before Message) showing:
- **Associated contacts**: Name, role, stage, last contact date for each other lead at this company
- **Combined meetings**: Total meeting count across all company contacts
- **Shared intelligence highlights**: If any associate has meeting intelligence, surface the top pain point or objection — gives context even if THIS lead hasn't had a meeting yet
- Clickable names to jump to that lead's detail

### 4. Implementation

**Helper function** `getCompanyAssociates(lead, allLeads)`:
- Extract domain from `companyUrl` (strip protocol/www) or `email` (after @)
- Find all other leads sharing the same domain
- Fallback: fuzzy match on `company` field (exact match, case-insensitive)
- Return array of associated leads

| File | Changes |
|------|---------|
| `src/lib/leadUtils.ts` | Add `getCompanyAssociates(lead, leads)` helper |
| `src/components/Pipeline.tsx` | Add "👥 N contacts" line on cards when associates exist |
| `src/components/LeadsTable.tsx` | Add "Company Activity" section in LeadDetail showing associates, their stages, combined meeting count, and top shared intelligence |

No type changes needed. No edge functions. Pure client-side matching using existing data fields (`companyUrl`, `email`, `company`).

