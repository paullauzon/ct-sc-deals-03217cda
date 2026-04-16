

# Fix: LinkedIn Verification Rejects Valid Nickname Matches

## Root Cause

The Woody Cissel case reveals two bugs working together:

1. **Double verification with contradictory results.** The quick-match path inside `aiSearchAgent` calls `inlineVerify` and gets "correct." Then `processLead` calls `inlineVerify` again on the exact same URL and gets "wrong." Two AI calls, two different answers — and the second one wins.

2. **Verification prompt is nickname-blind.** The `inlineVerify` prompt says `Name: Woody Cissel` but the LinkedIn shows "William Cissel." The prompt has no rule about nicknames. The rationalization step already figured out William = Woody, but that context is never passed to the verification step.

## Timeline of the Bug

```text
13:32:32  Rationalize: "Woody is a nickname for William/Woodrow" ✓
13:32:39  Quick-match search finds william-cissel-95562023 ✓
13:32:41  inlineVerify #1 (inside aiSearchAgent): "correct" ✓
13:32:41  aiSearchAgent returns URL ✓
13:32:42  inlineVerify #2 (inside processLead): "wrong — William ≠ Woody" ✗
13:32:42  Result: NOT FOUND  ← profile was found and verified, then thrown away
```

## Fix (1 file)

### File: `supabase/functions/backfill-linkedin/index.ts`

**Fix A: Pass name variants to inlineVerify**

Add an optional `nameVariants` parameter to `inlineVerify`. When provided, inject a line into the prompt:

```
KNOWN NAME VARIANTS (confirmed by analysis): William Cissel, Woodrow Cissel, Woody Cissel
- If the LinkedIn name matches ANY of these variants, the name is CORRECT.
- Common nickname mappings (Woody→William, Bob→Robert, etc.) are valid matches.
```

Update all call sites to pass `rationalization?.name_variants` when available.

**Fix B: Remove redundant second verification in processLead**

When `aiSearchAgent` returns a URL that was already verified inside the agent (quick-match path), skip the second `inlineVerify` call in `processLead`. Add a `verified` boolean flag to the `AgentResult` interface. When the quick-match path verifies and accepts a URL, set `verified: true`. In `processLead`, only run `inlineVerify` if `agentResult.verified !== true`.

This eliminates the contradiction risk and saves an AI call per lead.

## No other files change. No UI changes.

