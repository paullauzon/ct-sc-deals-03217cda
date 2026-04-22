

## Switch all AI generation from Lovable AI Gateway to OpenAI direct

Per the project memory rule (`mem://integrations/ai-model-usage`), all AI calls must use OpenAI direct. Phases 1–7 (and a few legacy functions) drifted onto the Lovable AI Gateway. This plan rips that out everywhere and standardizes on OpenAI's latest models via `OPENAI_API_KEY` (already in secrets).

### Model standard

- **Default for all generation, reasoning, extraction, drafting, streaming**: `gpt-5` (OpenAI's latest, most thorough)
- **Lightweight per-message classification only** (single inbound email sentiment, short tag extraction): `gpt-5-mini` to keep latency reasonable on tabs that fan out 10+ calls
- All calls go to `https://api.openai.com/v1/chat/completions` with `Authorization: Bearer ${OPENAI_API_KEY}`
- Tool-calling payload shape stays identical (OpenAI-native), so existing `tools` / `tool_choice` blocks port 1:1
- Streaming endpoints (`ask-deal`, `daily-standup`) keep `stream: true` — OpenAI SSE format is the same shape the clients already parse

### Files to convert (11 edge functions)

| Function | Current model | New model | Notes |
|---|---|---|---|
| `analyze-email-message` | gemini-3-flash | gpt-5-mini | Per-message; high call volume |
| `analyze-email-thread` | gemini-3-flash | gpt-5 | Thread-level intel, runs every 6h |
| `ask-deal` | gemini-3-flash | gpt-5 | Streaming chat |
| `compose-email-drafts` | gemini-3-flash | gpt-5 | Tool-calling, 3 drafts |
| `daily-standup` | gemini-3-flash | gpt-5 | Streaming summary |
| `extract-email-tasks` | gemini-3-flash | gpt-5-mini | Cron every 15m, high volume |
| `generate-nurture-email` | gemini-3-flash | gpt-5 | |
| `generate-stage-draft` | gemini-3-flash | gpt-5 | |
| `refine-email-line` | gemini-3-flash | gpt-5 | Inline rewrite tools |
| `suggest-email-responses` | gemini-3-flash | gpt-5 | Tool-calling, 3 options |
| `backfill-linkedin` | gemini fallback | remove fallback | Already prefers OpenAI; just delete the Lovable fallback branch |

### Mechanical changes per file

1. Replace every `Deno.env.get("LOVABLE_API_KEY")` with `Deno.env.get("OPENAI_API_KEY")`
2. Replace `https://ai.gateway.lovable.dev/v1/chat/completions` with `https://api.openai.com/v1/chat/completions`
3. Replace `model: "google/gemini-3-flash-preview"` (or any `google/*` / `openai/*` gateway slug) with `model: "gpt-5"` (or `gpt-5-mini` for the two high-volume classifiers)
4. Update error messages: drop the "AI credits exhausted — Settings → Workspace → Usage" copy (Lovable-specific) and replace with generic "AI provider error" / "Rate limited, try again shortly"
5. Update the variable name to `OPENAI_API_KEY` for clarity in each file

No request/response shape changes are needed — OpenAI Chat Completions is the API the gateway was emulating.

### Out of scope

- **Outlook deep sync** — paused per your note until Josh confirms; no changes touching Outlook OAuth or sync functions
- **Frontend code** — no client-side AI calls exist in this project, so nothing to change in `src/`
- **Cron schedules** — unchanged
- **Memory update** — `mem://integrations/ai-model-usage` already states "direct OpenAI only," so it's already correct; no edit needed

### Verification

After deploy, I'll spot-check by invoking `analyze-email-message` and `compose-email-drafts` against a real lead via the curl-edge-functions tool to confirm OpenAI returns 200 and the tool-calling JSON parses correctly.

