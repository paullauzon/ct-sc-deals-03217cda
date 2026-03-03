

# Next-Level Intelligence: What's Still Missing

## What's Already Built
- Per-meeting intelligence extraction (16 fields) with prior-meeting context
- Cross-meeting deal intelligence synthesis (stakeholder map, objection tracker, momentum, buying committee)
- AI enrichment with suggested field updates
- Auto-update of lastContactDate and nextFollowUp

## What's Still Missing — 5 High-Impact Capabilities

### 1. Meeting Prep Brief Generator
**The gap**: Before the next call, a rep has to manually re-read all meeting notes, check open action items, recall objections. No sales leader at a Fortune 100 would accept this.

**What to build**: A "Prep for Next Meeting" button that calls a new edge function (`generate-meeting-prep`) which takes all accumulated intelligence and produces:
- Open action items WE owe them (with deadlines)
- Open action items THEY owe us (follow-up leverage)
- Unresolved objections to address proactively
- Stakeholder concerns to navigate
- Competitive threats to counter
- Personalized talking points to advance the deal stage
- Questions to ask based on intelligence gaps

Rendered as a clean, printable brief in a dialog.

### 2. AI-Generated Follow-Up Email Drafts
**The gap**: After every meeting, the rep should send a follow-up within hours. The AI already knows what was discussed, what was agreed, what the next steps are — it should draft the email.

**What to build**: A "Draft Follow-Up" button on each meeting card. Calls a new edge function (`draft-followup`) that takes the meeting intelligence + deal context and generates a professional follow-up email with:
- Thank you + reference to specific discussion points
- Summary of agreed next steps with owners
- Confirmation of any commitments made
- Soft advancement toward next stage

Rendered in a copyable text area.

### 3. Deal Health Alerts & Warnings
**The gap**: The deal intelligence panel shows data but doesn't proactively warn. An FBI analyst doesn't just compile — they flag threats.

**What to build**: A computed alerts system (client-side, no new edge function) that scans each lead and surfaces warnings:
- "Deal stalling: X days since last meeting" (when > 2x average frequency)
- "X overdue action items" (from deal intelligence tracker)
- "Blocker identified: [name] — no mitigation plan"
- "Sentiment declining across last 3 meetings"
- "No follow-up scheduled" (nextFollowUp empty or past)
- "Contract expiring in X days" (from contractEnd)

Rendered as amber/red alert badges at the top of the lead detail panel.

### 4. Re-Synthesize Button + Momentum Trend Chart
**The gap**: No way to manually re-trigger synthesis. Momentum trajectory data exists but isn't visualized.

**What to build**:
- "Re-synthesize" button on the DealIntelligencePanel
- A small recharts line/area chart showing sentiment, intent, and engagement trajectories across meetings (data already exists in `momentumSignals`)

### 5. Talk Ratio & Coaching Metrics
**The gap**: A great SVP doesn't just track deals — they coach reps. The transcript contains signal about rep performance.

**What to build**: Add 3 new fields to the `process-meeting` tool schema:
- `talkRatio`: estimated percentage of time our team talked vs prospect (proxy for listening quality)
- `questionQuality`: "Strong" | "Adequate" | "Weak" — did we ask discovery questions or just pitch?
- `objectionHandling`: "Effective" | "Partial" | "Missed" — did we address objections when raised?

Display as small coaching badges on each meeting card.

## Implementation Plan

| File | Change |
|------|--------|
| `supabase/functions/generate-meeting-prep/index.ts` | New — meeting prep brief generator |
| `supabase/functions/draft-followup/index.ts` | New — follow-up email draft generator |
| `supabase/functions/process-meeting/index.ts` | Add talkRatio, questionQuality, objectionHandling to schema |
| `src/types/lead.ts` | Add coaching fields to MeetingIntelligence |
| `src/components/MeetingsSection.tsx` | Add "Prep Brief" and "Draft Follow-Up" buttons + dialogs, coaching badges |
| `src/components/DealIntelligencePanel.tsx` | Add re-synthesize button, momentum trend chart |
| `src/components/LeadsTable.tsx` | Add deal health alerts at top of lead detail |

