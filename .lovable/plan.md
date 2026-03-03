

# Fix: Fireflies Auto-Find Missing Transcripts (Pagination)

## Root Cause

The Fireflies GraphQL query fetches `transcripts` with **no pagination parameters** (`limit`, `skip`). The API defaults to returning only the most recent ~30-50 transcripts. If Brady Blackett's meetings are older, they're never returned from the API — so no local filtering logic can find them.

Additionally, the company word "atrium" should match (it's not in the generic list), but the transcripts simply aren't in the result set.

## Fix

### 1. Add pagination to the Fireflies GraphQL query (`fetch-fireflies/index.ts`)

The Fireflies API supports `transcripts(limit: Int, skip: Int)`. Update the query to:
- Accept a larger limit (e.g., 500) to pull more transcripts
- Implement pagination: loop with `skip` in increments until we've fetched enough or exhausted results

```graphql
query Transcripts($limit: Int, $skip: Int) {
  transcripts(limit: $limit, skip: $skip) {
    id
    title
    ...
  }
}
```

### 2. Fetch in batches until we have enough matches

Instead of one big fetch, paginate through transcripts in batches of 50-100:
- Fetch batch → filter against search criteria → accumulate matches
- Stop when we have enough matches OR we've exhausted all transcripts
- This avoids downloading thousands of full transcripts (with sentences) when we only need a few

### 3. Optimize: fetch metadata first, then full transcripts

To avoid downloading huge sentence arrays for every transcript:
- **First pass**: Fetch transcripts WITHOUT `sentences` (just title, date, participants, organizer_email) — fast metadata scan
- **Second pass**: For matched transcripts only, fetch the full transcript with `sentences` using individual `transcript(id: $id)` queries

This makes the search much faster and more scalable.

| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Add pagination to GraphQL query, implement batch fetching, optimize with metadata-first approach |

