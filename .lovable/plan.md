

# Bulletproof Fireflies Meeting Matching

## Changes

### 1. Add company domain matching (`fetch-fireflies/index.ts`)
Accept a new `searchDomains: string[]` param. Extract domain from `lead.email` (e.g., `acme.com`) and match against all participant emails' domains. Skip generic domains (gmail, yahoo, hotmail, outlook).

### 2. Word-boundary name matching (`fetch-fireflies/index.ts`)
Replace `field.includes(part)` with word-boundary regex matching: `new RegExp(\`\\b${part}\\b\`, 'i')`. This prevents "Art" matching "Martin" while still matching "Art Smith".

### 3. Send company domain from auto-find (`MeetingsSection.tsx`)
Extract domain from `lead.email` and pass it as `searchDomains: [domain]` (excluding generic email providers).

### 4. Increase fetch limit + use date sorting
Bump default limit from 50 to 100 for auto-find. Fireflies returns newest first by default, which is good — but document this assumption.

### 5. Add nickname/alias handling (lightweight)
Maintain a small map of common nicknames (`mike↔michael`, `rob↔robert`, `bill↔william`, etc.) in the edge function. When matching names, also check known aliases.

| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Add domain matching, word-boundary regex, nickname map, bump limit |
| `src/components/MeetingsSection.tsx` | Extract and send email domain in auto-find call |

These changes layer 4 independent matching signals — email, full name (with nicknames), speaker name, and company domain — making it very unlikely to miss a real meeting or match a wrong one.

