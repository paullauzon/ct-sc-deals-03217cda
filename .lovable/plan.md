

# Stratospheric Meeting Intelligence: Accumulated Cross-Meeting Deal Memory

## Current State

The system extracts 16 structured fields per meeting via `process-meeting`, and passes prior meeting context so each new meeting is informed by previous ones. The `enrich-lead` function aggregates meeting intelligence for holistic analysis. The screenshot shows this working well for individual meetings.

## What's Missing — The Intelligence Gaps

### 1. Intelligence is Read-Forward Only, Never Written Back
When meeting 2 reveals that an action item from meeting 1 was completed, or an objection was overcome, or a decision was reversed — **meeting 1's intelligence is never updated**. The prior context flows forward but insights never flow backward.

### 2. No Unified Deal Narrative
Each meeting has its own summary, but there's no single synthesized "deal story" — a living document that evolves with every meeting showing the full arc: how the relationship started, pivoted, escalated, what changed.

### 3. No Stakeholder Dossiers
Attendees appear per meeting but there's no accumulated profile per person: what they care about, how their stance evolved, their influence level, their objections, their questions across all meetings.

### 4. Action Items Have No Lifecycle
Meeting 1 creates action items. Meeting 2's `priorFollowUps` notes which were "Addressed" / "Outstanding" / "Dropped". But there's no unified action tracker that persists the resolution status back to the original items and tracks completion rates.

### 5. No Objection/Pain Point Evolution Tracking
An objection raised in meeting 1 might be addressed in meeting 2 but resurface differently in meeting 3. Currently each meeting lists objections independently with no lineage.

### 6. No Deal Momentum Metrics
Meeting frequency, days between meetings, sentiment trajectory, engagement trajectory, action item completion rate — these are all computable from existing data but never calculated.

---

## The Plan: Accumulated Intelligence Layer

### A. Add a `dealIntelligence` Object to the Lead (New Type + Computed on Each Meeting Process)

A lead-level intelligence summary that is **recomputed every time a meeting is processed**, synthesizing ALL meetings. This is the "accumulated brain."

Fields:
- `dealNarrative`: 1-paragraph evolving story of the entire deal arc
- `stakeholderMap`: Array of `{ name, role, company, stance, influence, concerns, mentions, firstSeen, lastSeen }`
- `objectionTracker`: Array of `{ objection, raisedIn, status: "Open"|"Addressed"|"Recurring", addressedIn, resolution }`
- `actionItemTracker`: Array of `{ item, owner, createdIn, status, resolvedIn, deadline }`
- `momentumSignals`: `{ meetingFrequencyDays, sentimentTrajectory[], intentTrajectory[], engagementTrajectory[], completionRate, momentum: "Accelerating"|"Steady"|"Stalling"|"Stalled" }`
- `keyMilestones`: Array of `{ date, event, significance }` — e.g. "Champion identified", "Budget confirmed", "Contract discussed"
- `riskRegister`: Array of `{ risk, severity, source, mitigationStatus }`
- `competitiveTimeline`: Array of `{ date, event }` — when competitors were mentioned, evaluated, dismissed
- `buyingCommittee`: `{ decisionMaker, champion, influencers, blockers, unknowns }`
- `dealStageEvidence`: What evidence supports the current stage, what evidence suggests advancement

### B. New Edge Function: `synthesize-deal-intelligence`

Called after every `process-meeting` completes. Receives ALL meetings with their intelligence + current lead fields. Returns the unified `dealIntelligence` object.

This is the FBI analyst brain: it cross-references every meeting, tracks every thread, identifies patterns, flags contradictions, and maintains the complete operational picture.

System prompt instructs it to:
- Track every action item across meetings and mark resolution status
- Track every objection and whether/how it was addressed
- Build stakeholder profiles from all mentions across all meetings
- Compute momentum from meeting cadence and signal trajectories
- Identify milestone events and build a deal timeline
- Flag risks with severity and mitigation status
- Identify the buying committee structure
- Write a narrative that tells the deal story

### C. Auto-Trigger After Meeting Processing

In `MeetingsSection.tsx`, after `process-meeting` succeeds, automatically call `synthesize-deal-intelligence` with all meetings. Store the result on `lead.dealIntelligence`.

### D. UI: Deal Intelligence Dashboard Tab

Add a new tab or section in the lead detail panel showing:
- **Deal Narrative** — the living story
- **Stakeholder Map** — who's who with stance indicators
- **Action Tracker** — unified cross-meeting action items with completion status
- **Objection Tracker** — each objection with its lifecycle
- **Momentum Gauge** — visual indicator with trajectory
- **Risk Register** — active risks with severity
- **Key Milestones** — timeline of deal events
- **Buying Committee** — decision maker, champion, blockers

### E. Inform Enrichment

Pass `dealIntelligence` to `enrich-lead` so the holistic enrichment has access to the accumulated cross-meeting synthesis, not just raw aggregated fields.

## Files Changed

| File | Change |
|------|--------|
| `src/types/lead.ts` | Add `DealIntelligence` interface and `dealIntelligence` field to `Lead` |
| `supabase/functions/synthesize-deal-intelligence/index.ts` | New edge function — cross-meeting synthesis engine |
| `src/components/MeetingsSection.tsx` | Auto-call synthesis after processing; store result on lead |
| `src/components/LeadsTable.tsx` | Add Deal Intelligence display section in lead detail panel |
| `supabase/functions/enrich-lead/index.ts` | Accept and use `dealIntelligence` in context |

