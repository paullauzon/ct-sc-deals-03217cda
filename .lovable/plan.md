

# AI-Driven LinkedIn Discovery — Replace Hardcoded Rules with AI Research Agent

## The Core Problem

The current system runs 9 passes of increasingly desperate keyword searches, each with hardcoded rules for query construction, URL filtering, and name matching. When these rigid patterns fail (79 of 191 leads), there's no fallback — the system just gives up.

Your insight is correct: a human finds Michael Tindall by **reasoning** — "let me search the company, find their LinkedIn page, browse employees." That reasoning can't be captured in `site:linkedin.com/in "${name}" "${clean}"` templates.

## The New Approach: AI Search Agent

Instead of hardcoded search passes, give the AI model the lead's full context and let **it decide** what to search for, interpret results, and iterate. This is fundamentally different — instead of 9 predetermined queries, the AI gets 3-5 **search turns** where it chooses what to search each time based on what it learned from previous results.

### How It Works

```text
┌─────────────────────────────────────────┐
│  AI Agent Loop (per lead)               │
│                                         │
│  1. AI sees: name, company, email,      │
│     role, message, company_url          │
│                                         │
│  2. AI outputs: search query to try     │
│     (it decides what to search)         │
│                                         │
│  3. System runs Firecrawl search,       │
│     returns results to AI               │
│                                         │
│  4. AI analyzes results:                │
│     - Found a match? → Return URL       │
│     - Need more info? → New query       │
│     - Dead end? → Try different angle   │
│                                         │
│  5. Repeat up to 5 turns, then give up  │
└─────────────────────────────────────────┘
```

### What the AI Can Do That Rules Can't

- **Reason about company names**: "Treatyoakequity" → "This looks like Treaty Oak Equity, let me search that"
- **Pivot strategies**: "No results for the person, let me find the company LinkedIn page first and look for employees"
- **Use context clues**: "Their email is at hanacovc.com, let me search Hanaco Ventures on LinkedIn"
- **Handle weird data**: "This company URL points to albertacorporations.com/grafton-street-concepts-inc — the actual company is Grafton Street Concepts"
- **Recognize dead ends**: "This person used a disposable email (mozmail.com) and has no real company — skip"

## Implementation

### File: `supabase/functions/backfill-linkedin/index.ts`

Replace the 9-pass `collectAllCandidates()` + `aiPickBestCandidate()` with a single **AI agent loop**:

1. **New function `aiSearchAgent()`**: Takes the full lead context, gets access to Firecrawl search as a "tool." Uses structured output (tool calling) where the AI returns either:
   - `{"action": "search", "query": "..."}` — run this Firecrawl search
   - `{"action": "found", "url": "...", "confidence": "high/medium"}` — found the profile
   - `{"action": "give_up", "reason": "..."}` — no profile findable

2. **System prompt** tells the AI it's a LinkedIn research assistant with access to web search. Gives it strategies (search company first, try email domain, check company website, etc.) but lets it choose.

3. **Loop**: Up to 5 search turns per lead. Each turn: AI picks a query → Firecrawl runs it → results fed back to AI → AI decides next step.

4. **Keep existing infrastructure**: Scoring, title extraction, M&A detection, DB updates all stay the same. Only the search+verification logic changes.

5. **Keep the website function too**: `backfill-linkedin-website` stays as a complementary pass using Firecrawl Map on company sites.

### Cost & Speed

- ~79 leads × up to 5 searches × 1 AI call per turn = ~395 Firecrawl searches + ~395 AI calls
- AI calls are free (Lovable gateway). Firecrawl credits are the main cost.
- Each lead takes ~10-15s (vs ~20-30s now with 9 passes), since the AI often finds it in 1-2 turns
- With BATCH_SIZE=3, ~79 leads would need 2-3 function invocations

### Expected Impact

The AI agent approach should find **20-40 more** of the 79 remaining leads by:
- Intelligently parsing garbage company names
- Pivoting search strategies based on results  
- Using company website URLs to find the real company name
- Recognizing when a lead is genuinely unfindable (spam, fake data)

## Technical Details

- Model: `google/gemini-2.5-flash` (fast, good at tool-use patterns)
- Tool calling format: The AI returns JSON with action/query, system executes it
- Conversation history: Each turn's results are appended so the AI builds context
- Fallback: If AI agent finds nothing after 5 turns, mark as searched (empty string) same as today
- The existing `backfill-linkedin-website` Firecrawl Map function runs as a second pass for any remaining unmatched leads with company URLs

