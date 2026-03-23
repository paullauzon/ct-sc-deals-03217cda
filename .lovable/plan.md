

# Fix: LinkedIn Discovery for Non-Standard Profile Slugs

## Root Cause

Two issues combined to miss Ellie Burei:

1. **Agent verification is too strict on URL slugs**: The system prompt tells the AI agent to verify that "The LinkedIn URL slug should contain at least part of the person's name." The correct profile `linkedin.com/in/emb339/` has initials-based slug — no substring of "Ellie" or "Burei" appears. The agent either never found it, or found it and rejected it due to this rule.

2. **No retry mechanism**: Once the agent gives up, `linkedin_url` is set to `""` (empty string). Batch mode only processes `linkedin_url IS NULL`, so these leads are permanently abandoned. There's no way to re-trigger enrichment for a failed lead.

## Fix Plan

### 1. Relax URL slug verification in agent prompt
**File**: `supabase/functions/backfill-linkedin/index.ts` — update `buildSystemPrompt()`

Change the verification rule from requiring name in the slug to:
```
- The LinkedIn URL slug does NOT need to match the person's name — many people use initials, 
  numbers, or random slugs (e.g., "emb339" for "Ellie M. Burei")
- Instead, verify by SCRAPING the profile or reading the search snippet to confirm the 
  person's name and company match
- If a search result shows the right name + company but has an unusual slug, that's CORRECT
```

This makes the agent rely on **content verification** (name + company in the profile) rather than **URL pattern matching**.

### 2. Add "retry failed" capability to batch mode
**File**: `supabase/functions/backfill-linkedin/index.ts`

Accept an optional `retryFailed: true` parameter. When set, query leads where `linkedin_url = ''` (empty string = previously failed) instead of `linkedin_url IS NULL`. This allows re-running the agent on leads that failed with the old, stricter rules.

### 3. Immediately fix Ellie Burei
Since we already know the correct URL, we should also allow manual LinkedIn URL assignment. But the prompt fix + retry is the systematic solution.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/backfill-linkedin/index.ts` | Relax slug verification in prompt; add `retryFailed` param |

## Impact
- Fixes Ellie Burei and any other leads with non-standard LinkedIn slugs (initials, numbers, maiden names)
- Existing correct matches unaffected — the agent still verifies name + company from profile content
- Retry capability lets us re-process the ~100+ leads that previously failed

