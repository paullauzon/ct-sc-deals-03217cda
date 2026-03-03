

# AI-Driven Lead Field Updates from Enrichment Intelligence

## The Gap

Currently, when AI enrichment runs, it produces rich intelligence (deal health score, engagement trend, likelihood to close, recommended next actions, objections, risk assessment) — but **none of this intelligence feeds back into the lead's actual operational fields**. The enrichment data sits in a read-only display section while the sales rep must manually interpret and update stage, priority, forecast, follow-up dates, ICP fit, etc.

This is a missed opportunity. The AI already knows enough to **suggest or auto-update** these fields.

## What Should Happen

### 1. AI Returns Suggested Field Updates (New Tool Output)

Expand the `enrich_lead` tool schema to include a new `suggestedUpdates` object:

```
suggestedUpdates: {
  stage: { value: "Negotiation", reason: "Budget discussed, decision timeline set" },
  priority: { value: "High", reason: "Strong buying intent, active timeline" },
  forecastCategory: { value: "Best Case", reason: "Champion identified, budget confirmed" },
  icpFit: { value: "Strong", reason: "Matches target profile exactly" },
  nextFollowUp: { value: "2026-03-07", reason: "Prospect requested proposal by Friday" },
  dealValue: { value: 60000, reason: "Discussed $5k/mo retainer = $60k annual" },
  serviceInterest: { value: "Full Platform (All 3)", reason: "Expressed interest in all services" },
  meetingOutcome: { value: "Held", reason: "Meeting completed per transcript" }
}
```

Each suggestion includes a **reason** so the user can accept/reject with context.

### 2. Post-Enrichment UI: "AI Suggestions" Panel

After enrichment completes, instead of silently saving only the enrichment blob, show an **"AI Suggested Updates"** section at the top of the enrichment display. For each suggested field change:

- Show current value → suggested value with the AI's reason
- Accept (checkmark) / Dismiss (X) buttons per suggestion
- "Accept All" button for speed
- Accepted changes call `save()` to update the lead's actual fields

### 3. Auto-Set `lastContactDate` from Latest Meeting

When a meeting is processed, automatically update `lastContactDate` to the meeting date. This is factual, not a suggestion — it should just happen.

### 4. Auto-Calculate `nextFollowUp` from Meeting Next Steps

When meeting intelligence includes next steps with deadlines, auto-suggest the earliest deadline as the `nextFollowUp` date.

## Implementation Plan

### A. Update `enrich-lead` Edge Function

Add `suggestedUpdates` to the tool schema with fields: `stage`, `priority`, `forecastCategory`, `icpFit`, `nextFollowUp`, `dealValue`, `serviceInterest`, `meetingOutcome`. Each is an object with `value` and `reason`. All optional. Add system prompt instructions telling the AI to suggest field updates based on its analysis, only when evidence supports a change.

### B. Update `LeadEnrichment` Type

Add `suggestedUpdates` to the `LeadEnrichment` interface in `src/types/lead.ts`.

### C. Build AI Suggestions UI Component

New component in `LeadsTable.tsx` (or extracted): renders suggested updates as a list of current→proposed changes with accept/dismiss per item. On accept, calls `save()` with the field update and removes the suggestion from display.

### D. Auto-Update `lastContactDate` on Meeting Add

In `MeetingsSection.tsx`, when meetings are added (auto-find or manual), update `lastContactDate` to the latest meeting date.

### E. Auto-Suggest `nextFollowUp` from Meeting Intelligence

After `process-meeting` returns, if next steps have deadlines, suggest the earliest as `nextFollowUp`.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/enrich-lead/index.ts` | Add `suggestedUpdates` to tool schema + system prompt |
| `src/types/lead.ts` | Add `suggestedUpdates` to `LeadEnrichment` |
| `src/components/LeadsTable.tsx` | Build suggestions UI, handle accept/dismiss, wire into `handleEnrich` |
| `src/components/MeetingsSection.tsx` | Auto-update `lastContactDate` on meeting add |

