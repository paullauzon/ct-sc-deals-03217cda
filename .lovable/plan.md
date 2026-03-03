

# Auto-Update Lead Fields from Transcript Intelligence

## Current State

When a transcript is processed (via auto-find or manual add), the system:
1. Extracts meeting intelligence (summary, deal signals, attendees, etc.)
2. Updates `lastContactDate` and `nextFollowUp`
3. Synthesizes deal intelligence across all meetings
4. **Does NOT** update stage, meetingDate, priority, forecastCategory, icpFit, serviceInterest, assignedTo, or any other CRM fields

This is a significant gap — the AI already extracts buying intent, sentiment, timeline, engagement level, and attendee details, but none of it flows back into the lead record.

## Strategy: Extend `process-meeting`, NOT the "Research & Recommend" Button

The right place for this is **immediately after transcript processing** — not behind a manual button click. Rationale:

- **Timeliness**: The moment a transcript lands, the CRM should reflect reality. Making a rep click another button is friction and human error.
- **Data source**: The transcript IS the source of truth for stage, meeting outcome, dates, and deal signals. External research (Research & Recommend) has no visibility into what was said.
- **Certainty**: The AI already extracts structured signals (buyingIntent, sentiment, timeline, engagement). We just need to map those to CRM field recommendations with confidence levels.

## How It Works

### 1. Add a `suggestedLeadUpdates` tool output to `process-meeting`

Extend the existing tool schema in `process-meeting` with a new property:

```
suggestedLeadUpdates: {
  stage: { value, confidence, evidence }
  meetingOutcome: { value, confidence, evidence }
  meetingDate: { value, confidence, evidence }
  nextFollowUp: { value, confidence, evidence }
  priority: { value, confidence, evidence }
  forecastCategory: { value, confidence, evidence }
  icpFit: { value, confidence, evidence }
  serviceInterest: { value, confidence, evidence }
  dealValue: { value, confidence, evidence }
  assignedTo: { value, confidence, evidence }
}
```

Each field has a **confidence** level ("Certain", "Likely", "Possible") and an **evidence** string quoting the transcript basis. The AI only populates fields it can support from the transcript.

### 2. Auto-apply "Certain" fields, surface others for review

In `MeetingsSection.tsx`, after receiving intelligence:
- **Auto-apply** any field where confidence = "Certain" (e.g., meeting was held → stage = "Meeting Held", meeting date extracted from transcript)
- **Show a toast/dialog** for "Likely" suggestions, letting the rep accept/dismiss (reuse the same accept/dismiss pattern from Research & Recommend's suggested updates)
- **Ignore** "Possible" — too risky for auto-application

### 3. Stage inference logic (in the system prompt)

The AI will be instructed with clear mapping rules:

- If a meeting happened → at minimum "Meeting Held"
- If a proposal/pricing was discussed in detail → "Proposal Sent"  
- If they're negotiating terms/contract → "Negotiation"
- If they said "send us the contract" → "Contract Sent"
- If they verbally committed → "Closed Won"
- If they declined/said no → "Closed Lost"
- If no response signals → "Went Dark"

The prompt emphasizes: **only suggest what the transcript explicitly supports. When in doubt, don't suggest.**

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/process-meeting/index.ts` | Add `suggestedLeadUpdates` to tool schema with confidence levels. Enhance system prompt with stage-mapping rules. |
| `src/components/MeetingsSection.tsx` | After processing: auto-apply "Certain" updates via `updateLead()`, show accept/dismiss UI for "Likely" suggestions. Apply to both auto-find and manual-add flows. |

No type changes needed — `updateLead` already accepts `Partial<Lead>`. The suggestions are transient (used once during processing, not stored as a separate structure).

