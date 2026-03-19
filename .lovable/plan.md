

# Use OpenAI Directly for LinkedIn Discovery

## What Changes

The current agent uses the Lovable AI gateway (Gemini models) for reasoning. You already have an `OPENAI_API_KEY` secret configured. We'll add OpenAI as a **direct reasoning engine** — specifically using it for the harder Pass 2 retry instead of Gemini Pro via the gateway.

OpenAI's GPT-4o has strong web-knowledge and reasoning capabilities that may find profiles Gemini misses, especially for ambiguous company names and obscure individuals.

## Implementation

### File: `supabase/functions/backfill-linkedin/index.ts`

1. **Add `callOpenAI()` helper** — calls `https://api.openai.com/v1/chat/completions` directly using the existing `OPENAI_API_KEY` secret with model `gpt-4o`

2. **Modify `aiSearchAgent()`** — add an `apiProvider` parameter (`"lovable"` or `"openai"`). When `"openai"`, route AI calls to OpenAI directly instead of the Lovable gateway. Same system prompt, same tool loop, different model backend.

3. **Update the two-pass flow**:
   - **Pass 1**: Gemini 2.5 Flash via Lovable gateway (5 turns) — same as now, fast and cheap
   - **Pass 2**: GPT-4o via OpenAI directly (8 turns) — replaces Gemini Pro for failed leads. Different model architecture may reason differently about the same search results, finding profiles Gemini missed.

4. **Read `OPENAI_API_KEY`** from `Deno.env.get()` at the top of the handler, alongside the existing keys. If not set, fall back to Gemini Pro for Pass 2 (graceful degradation).

### No other files change
- Same Firecrawl search/scrape tools, same system prompt, same scoring/enrichment logic
- Same database reset flow for failed leads

## Expected Impact
Different model architectures reason differently about ambiguous data. GPT-4o may find 5-15 more profiles that Gemini couldn't, particularly for leads where company name interpretation or creative search pivots are needed.

