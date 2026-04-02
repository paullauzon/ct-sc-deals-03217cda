

# Ban Em Dashes, En Dashes, and Double Hyphens from AI Output

## Problem

The GOOD examples in our prompts use em dashes (`—`) as separators:
- `"John — your 3rd bolt-on..."` 
- `"— Mike"`
- `"Sarah — 14 HVAC distributors..."`

The AI mimics these examples and produces copy full of em dashes. The user wants none of these in any generated output.

## Fix

### 1. Add dash ban to all email-generating prompts

Add this rule to the base prompt in both `generate-follow-up-action` and `draft-followup`:

```
- NEVER use em dashes (—), en dashes (–), or double hyphens (--). Use periods, commas, or line breaks instead.
```

### 2. Rewrite all GOOD examples to remove dashes

Replace dash-separated examples with comma/period equivalents:

**Before:** `"John — your 3rd bolt-on this year puts you ahead...Worth a 15-min look Thursday? — Mike"`

**After:** `"John, your 3rd bolt-on this year puts you ahead...Worth a 15-min look Thursday?\n\nMike"`

### 3. Fix sign-off format

Current examples sign off with `— Mike`. Change to just `Mike` on its own line (which also matches the "sign off with first name only" rule better).

### 4. Apply to `enrich-lead` openingHook field

Add to the openingHook field description: "Do not use em dashes, en dashes, or double hyphens."

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-follow-up-action/index.ts` | Add dash ban rule; rewrite all 6 GOOD examples to use commas/periods instead of dashes; fix sign-off format |
| `supabase/functions/draft-followup/index.ts` | Add dash ban rule; rewrite GOOD examples; fix sign-off format |
| `supabase/functions/enrich-lead/index.ts` | Add dash ban to `openingHook` and `preMeetingAmmo` field descriptions |

