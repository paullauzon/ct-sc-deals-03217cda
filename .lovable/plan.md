

# Switch All AI Calls from Lovable AI to OpenAI API

## Summary

7 backend functions currently use the Lovable AI Gateway (`ai.gateway.lovable.dev`) with `LOVABLE_API_KEY`. We need to switch all of them to call OpenAI's API directly (`api.openai.com`) with your own OpenAI API key.

## What I Need From You

**Your OpenAI API key.** I will securely store it as a backend secret called `OPENAI_API_KEY`. You can get one from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

## Changes

All 7 edge functions will be updated with the same pattern:

| Change | From | To |
|--------|------|----|
| API URL | `https://ai.gateway.lovable.dev/v1/chat/completions` | `https://api.openai.com/v1/chat/completions` |
| Auth key | `LOVABLE_API_KEY` | `OPENAI_API_KEY` |
| Model (flash) | `google/gemini-3-flash-preview` | `gpt-4o-mini` |
| Model (pro) | `google/gemini-2.5-pro` | `gpt-4o` |

### Functions affected (all 7):
1. **summarize-meeting** — flash → gpt-4o-mini
2. **process-meeting** — flash → gpt-4o-mini (uses tool calling, same format)
3. **fetch-fireflies** — flash → gpt-4o-mini
4. **generate-meeting-prep** — flash → gpt-4o-mini (uses tool calling)
5. **draft-followup** — flash → gpt-4o-mini
6. **enrich-lead** — pro → gpt-4o (uses tool calling)
7. **synthesize-deal-intelligence** — pro → gpt-4o (uses tool calling)

No client-side code changes needed — all AI calls go through edge functions.

### Model mapping rationale
- `gemini-3-flash-preview` / `gemini-2.5-flash` → **gpt-4o-mini** (fast, cheap, good for summaries and standard tasks)
- `gemini-2.5-pro` → **gpt-4o** (strongest reasoning, used for enrichment and deal synthesis where quality matters most)

