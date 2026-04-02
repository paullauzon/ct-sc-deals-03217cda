

# Ban Em Dashes, En Dashes, and Double Hyphens from All AI Copy

## Problem

All three email-generating edge functions have GOOD examples that use em dashes (`—`) as separators (e.g., `"John — your 3rd bolt-on..."`, `"— Mike"`). The AI mimics these and produces copy full of dashes.

## Changes

### 1. `generate-follow-up-action/index.ts`

- Add rule to base prompt: `"NEVER use em dashes (—), en dashes (–), or double hyphens (--). Use periods, commas, or line breaks instead."`
- Rewrite all 6 GOOD examples to replace `—` with commas/periods/line breaks:
  - `"John — your 3rd bolt-on..."` → `"John, your 3rd bolt-on..."`
  - `"— Mike"` → `"\n\nMike"`
  - Same for Cody, Sarah examples
- Add `"—"`, `"–"`, `"--"` to `BANNED_PHRASES`

### 2. `draft-followup/index.ts`

- Add same dash ban rule to system prompt
- Rewrite GOOD example: `"John — you mentioned..."` → `"John, you mentioned..."`
- Change `"— Mike"` → `"\n\nMike"`
- Add dashes to banned phrases list

### 3. `generate-meeting-prep/index.ts`

- Add dash ban to system prompt so opening hooks and other generated text avoid dashes

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-follow-up-action/index.ts` | Add dash ban rule; rewrite all GOOD examples to use commas/periods; add dash characters to BANNED_PHRASES |
| `supabase/functions/draft-followup/index.ts` | Add dash ban rule; rewrite GOOD example; add dash characters to banned list |
| `supabase/functions/generate-meeting-prep/index.ts` | Add dash ban to system prompt |

