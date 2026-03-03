

# Fix: Auto-Find Should Search Both Brands

## Root Cause

`handleAutoFind` in `MeetingsSection.tsx` (line 65) passes `brand: lead.brand`, so it only queries ONE Fireflies account. If Brady Blackett is a Captarget lead but the meeting was recorded under the SourceCo Fireflies account (or vice versa), it will never be found.

## Fix

### Update `handleAutoFind` in `src/components/MeetingsSection.tsx`

Search **both** Fireflies accounts (Captarget and SourceCo) in parallel, then merge and deduplicate results by `firefliesId`. This mirrors how the bulk import (`FirefliesImportDialog`) already fetches from both brands.

```typescript
const [ctResult, scResult] = await Promise.all([
  supabase.functions.invoke("fetch-fireflies", {
    body: { searchEmails: [lead.email], searchNames: [lead.name], searchDomains, searchCompanies, limit: 100, summarize: false, brand: "Captarget" },
  }),
  supabase.functions.invoke("fetch-fireflies", {
    body: { searchEmails: [lead.email], searchNames: [lead.name], searchDomains, searchCompanies, limit: 100, summarize: false, brand: "SourceCo" },
  }),
]);
// Merge + deduplicate by firefliesId
```

This ensures `bblackett@atriumhomeservices.com` is searched against ALL transcripts regardless of which Fireflies account recorded the meeting.

| File | Change |
|------|--------|
| `src/components/MeetingsSection.tsx` | Search both brands in `handleAutoFind`, merge and deduplicate results |

