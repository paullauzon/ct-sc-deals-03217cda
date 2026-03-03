

# Advanced Meeting Intelligence Processing

## Current State
The `process-meeting` edge function returns only two plain-text fields: `summary` and `nextSteps`. The `Meeting` type stores these as strings. The UI shows them in two simple text blocks.

## Plan

### 1. Expand Meeting type with structured intelligence (`src/types/lead.ts`)

Add a `MeetingIntelligence` interface to the `Meeting` type:

```typescript
export interface MeetingIntelligence {
  summary: string;
  attendees: { name: string; role: string; company: string }[];
  keyTopics: string[];
  nextSteps: { action: string; owner: string; deadline: string }[];
  actionItems: { item: string; owner: string; status: string }[];
  decisions: string[];
  // Deal signals
  dealSignals: {
    buyingIntent: "Strong" | "Moderate" | "Low" | "None detected";
    sentiment: "Very Positive" | "Positive" | "Neutral" | "Cautious" | "Negative";
    timeline: string; // e.g. "Q2 2026", "Next 30 days", "No timeline discussed"
    budgetMentioned: string;
    champions: string[]; // internal advocates
    competitors: string[];
    objections: string[];
    riskFactors: string[];
  };
  // Cross-meeting continuity
  priorFollowUps: { item: string; status: "Addressed" | "Outstanding" | "Dropped" }[];
  relationshipProgression: string;
  // Additional intelligence
  questionsAsked: string[];
  painPoints: string[];
  valueProposition: string; // what resonated
  engagementLevel: "Highly Engaged" | "Engaged" | "Passive" | "Disengaged";
}
```

Keep `summary` and `nextSteps` as top-level strings on `Meeting` for backward compatibility, but add `intelligence?: MeetingIntelligence`.

### 2. Update `process-meeting` edge function to use tool calling for structured output

Replace the free-text prompt + regex parsing with **tool calling** to get reliable structured JSON:

- Define a `meeting_intelligence` tool with the full schema matching `MeetingIntelligence`
- Use `tool_choice` to force the model to call it
- Harden the system prompt for M&A sales context: extract deal signals, identify champions vs. blockers, detect competitive mentions, gauge buying intent from specific language patterns
- Include prior meeting intelligence (not just summary) in the context for cross-meeting follow-up tracking
- Increase transcript limit to 25,000 chars (Gemini handles large context well)
- Extract `summary` and `nextSteps` from the structured response for backward compat

### 3. Update MeetingsSection UI (`src/components/MeetingsSection.tsx`)

Replace the simple summary/nextSteps display with organized sections using tabs or accordion:

- **Summary** tab: summary text + attendees list + engagement level badge
- **Action Items** tab: table of action items with owner and status columns
- **Deal Signals** tab: intent/sentiment/timeline badges, champions, competitors, objections as tagged lists
- **Decisions & Topics** tab: decisions list, key topics, questions asked, pain points
- **Prior Follow-ups** section (only when cross-meeting data exists): status of items from previous meetings

Each section renders dynamically — only shown if data exists. Use badges for sentiment/intent/engagement, bullet lists for items, and a compact layout that doesn't overwhelm.

### 4. Update auto-find and add-meeting flows

When processing meetings, pass prior meeting `intelligence` objects (not just summary strings) to the edge function so cross-meeting tracking works properly.

| File | Change |
|------|--------|
| `src/types/lead.ts` | Add `MeetingIntelligence` interface, add `intelligence?` to `Meeting` |
| `supabase/functions/process-meeting/index.ts` | Rewrite with tool calling schema, expanded prompt, structured output |
| `src/components/MeetingsSection.tsx` | Rich tabbed/accordion UI for all intelligence fields |

