

# Phase 8: Deep Competitive Intelligence Extraction & Dashboard

## Problem

The transcript processing pipeline (`process-meeting`) uses **gpt-4o-mini** and extracts competitive data as:
1. `competitors`: just an array of names — no context
2. `competitiveIntel`: a single free-text string — impossible to aggregate

This means the Competitors tab shows name counts and win/loss tallies but can't answer the questions that actually matter: *What do prospects like about competitors? What are they comparing us on? What's their current solution and why might they switch?*

The fix is two-part: richer extraction from transcripts + richer display in the dashboard.

## Changes

### 1. Upgrade `process-meeting` model and schema

**Model upgrade**: Change `gpt-4o-mini` → `gpt-4o` on line 367. This is the most important AI call in the system — it feeds everything downstream. The mini model misses nuance in competitive signals, objections, and psychological cues.

**Add structured competitive fields** to the `INTELLIGENCE_TOOL` schema (new properties inside `dealSignals`):

| New Field | Type | Description |
|-----------|------|-------------|
| `currentSolution` | `string` | What the prospect currently uses to solve this problem (tool, vendor, internal process, or "nothing") |
| `evaluationCriteria` | `string[]` | What criteria the prospect is using to compare options (e.g., "price", "speed to launch", "industry expertise") |
| `competitorDetails` | `array of {name, context, prospectSentiment, strengthsMentioned, weaknessesMentioned}` | Structured per-competitor intelligence replacing the flat `competitors` array |
| `switchingBarriers` | `string[]` | What's keeping them with their current solution (contracts, relationships, sunk cost, inertia) |
| `pricingIntel` | `string` | Any intelligence about competitor pricing or prospect budget benchmarks beyond our own pricing discussion |

Also enhance the top-level schema:
| New Field | Type | Description |
|-----------|------|-------------|
| `buyerJourney` | `string` | Where in the buying journey: "Problem Aware", "Solution Aware", "Evaluating", "Deciding", "Negotiating" |
| `internalChampionStrength` | `string` enum | "Strong", "Emerging", "Weak", "None" — how strong is our internal champion? |
| `nextMeetingRecommendation` | `string` | What the NEXT meeting should focus on based on this meeting's signals |

**Update the system prompt** to explicitly instruct:
- "For EVERY competitor or alternative mentioned, extract structured details — don't just list names"
- "Capture what the prospect is CURRENTLY doing (incumbent solution) even if it's manual/internal"
- "Note specific evaluation criteria the prospect uses to compare options"
- "Capture any switching barriers — contracts, relationships, comfort with status quo"

### 2. Update Lead types

Add to `MeetingIntelligence` in `src/types/lead.ts`:

```
currentSolution?: string;
evaluationCriteria?: string[];
competitorDetails?: { name: string; context: string; prospectSentiment: string; strengthsMentioned: string[]; weaknessesMentioned: string[] }[];
switchingBarriers?: string[];
pricingIntel?: string;
buyerJourney?: string;
internalChampionStrength?: "Strong" | "Emerging" | "Weak" | "None" | "";
nextMeetingRecommendation?: string;
```

### 3. Enhance Competitors tab in `IntelligenceCenter.tsx`

**NEW Block: Current Solutions Map** (before Competitor Radar)
- Aggregate `meetings[].intelligence.currentSolution` across all leads
- Group similar solutions, show frequency and pipeline value
- Answers: "What are we displacing? Where is the market today?"

**NEW Block: Evaluation Criteria Frequency**
- Aggregate `evaluationCriteria` across all leads
- Show top criteria with win rate correlation
- Answers: "What criteria do we win on vs. lose on?"

**Enhance existing Competitive Win/Loss Deep Dive:**
- Use `competitorDetails` instead of just names
- Show per-competitor: strengths prospects cite, weaknesses prospects cite, typical prospect sentiment
- Answers: "What do prospects actually SAY about each competitor?"

**NEW Block: Switching Barriers Analysis**
- Aggregate `switchingBarriers` across active pipeline
- Show frequency and which barriers appear most in lost deals
- Answers: "What's stopping deals from closing?"

**Enhance existing Competitor Radar (in `DashboardCompetitiveRadar.tsx`):**
- Show `competitorDetails` context alongside counts — not just "4 active" but the most common strength/weakness mentioned

### 4. Enhance Signals tab

**NEW Block: Buyer Journey Distribution**
- Aggregate `buyerJourney` across active pipeline
- Show pipeline value at each stage of the buying journey
- Answers: "How mature is our pipeline? Are we stuck at 'Problem Aware' or advancing to 'Deciding'?"

**NEW Block: Champion Strength Overview**
- Aggregate `internalChampionStrength` across active pipeline
- Show: X deals with Strong champion ($Yk), X with None ($Yk)
- Correlate with outcomes — strongest predictor of win/loss

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/process-meeting/index.ts` | Upgrade to gpt-4o, add 8 new structured fields to tool schema, enhance system prompt for deeper competitive extraction |
| `src/types/lead.ts` | Add new fields to `MeetingIntelligence` interface |
| `src/components/IntelligenceCenter.tsx` | Add 4 new blocks (Current Solutions, Eval Criteria, Switching Barriers, Buyer Journey, Champion Strength) and enhance existing competitive displays |
| `src/components/DashboardCompetitiveRadar.tsx` | Use `competitorDetails` for richer competitor rows when available |

### Important Notes

- **Backward compatible**: All new fields are optional. Existing processed meetings continue to work — they just won't have the new fields until re-processed.
- **Re-processing**: After deployment, users can re-process meetings to get the richer extraction. No migration needed.
- **No schema changes**: All data lives on the lead JSON objects, not in database tables.
- **Cost impact**: Upgrading from gpt-4o-mini to gpt-4o increases per-meeting processing cost ~10x, but this is the single most important AI call — the entire intelligence layer depends on its quality.

