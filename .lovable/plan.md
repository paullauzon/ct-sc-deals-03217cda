

# Prep Intel Redesign — From Information Dump to Battle Card

## The Real Problem

The current Prep Intel is a **reference sheet**, not a **battle card**. A 50-year sales veteran walking into a call in 2 hours doesn't want to read paragraphs about company descriptions and motivation. They want:

1. **What do I say in the first 30 seconds?** — An opening hook personalized to this prospect
2. **What's the ONE thing?** — The single insight that changes the call
3. **What NOT to say** — Landmines that kill deals
4. **What to ask** — 3 questions that unlock the next stage
5. **What's my goal?** — Clear desired outcome for this specific meeting

The current card shows raw context (company description, prospect message, motivation, urgency) but never synthesizes it into **actionable guidance**. It's like giving a pilot weather data instead of a flight plan.

## What Changes

### 1. Add "Battle Card" fields to the generate-meeting-prep edge function

Add 5 new fields to the tool schema that the AI already has context to generate:

- `openingHook` — Personalized first sentence referencing something specific about their company/situation
- `theOneInsight` — The single most important thing to know walking in (1 sentence)
- `landmines` — 2-3 things to NOT say or avoid
- `keyQuestions` — 3-5 strategic questions ranked by importance
- `meetingGoal` — The specific outcome to achieve ("Get verbal agreement to proceed to LOI review")

These are already implied by the existing prompt ("BATTLE-READY prep brief") but never explicitly extracted. The AI has all the context — we just need to ask for it.

### 2. Add "Quick Prep" fields for 0-meeting leads (enrich-lead)

For leads with no meetings (like Cody Mauri in the screenshot), the enrich-lead function already returns company description, motivation, urgency. Add:

- `openingHook` — Personalized opener based on research
- `discoveryQuestions` — 3-5 questions to ask in a first meeting
- `valueAngle` — How to position our service for THIS specific prospect
- `watchOuts` — Things to be careful about based on research

### 3. Redesign the IntelCard layout

Replace the current layout with a **battle card** format:

```text
┌──────────────────────────────────────────────────────┐
│ [Header: Name, Company, Meeting Time, Temp Badge]    │
│ [Signal strip: Calendly, meetings, emails, $, stage] │
├──────────────────────────────────────────────────────┤
│ 🎯 BATTLE CARD                    │ ACTIONS          │
│                                    │ [Prep Brief]     │
│ Opening: "Cody, I saw Dillard Door │ [Draft Email]    │
│ just partnered with Shore Capital— │ [Deal Room →]    │
│ curious how that's changing your   │                  │
│ approach to growth..."             │                  │
│                                    │                  │
│ #1 Insight: They're a security co  │                  │
│ expanding via PE — position our    │                  │
│ service as deal origination for    │                  │
│ their bolt-on acquisition strategy │                  │
│                                    │                  │
│ Goal: Qualify budget + timeline,   │                  │
│ get agreement to send target list  │                  │
│                                    │                  │
│ ⚠ Don't mention: [landmines]      │                  │
│                                    │                  │
│ Ask:                               │                  │
│ 1. "What's your acquisition        │                  │
│    criteria beyond security?"      │                  │
│ 2. "Who else is involved in        │                  │
│    evaluating origination firms?"  │                  │
│ 3. "What's your timeline for the   │                  │
│    next platform add-on?"          │                  │
├──────────────────────────────────────────────────────┤
│ ▸ Background (company, message, motivation, urgency) │
│ ▸ Deep Intel (win strategy, psych, objections, risks)│
└──────────────────────────────────────────────────────┘
```

**Key differences from current:**
- Battle card fields are the FIRST thing you see — not buried context paragraphs
- Opening hook gives you an exact sentence to say
- Goal tells you what "winning" this meeting looks like
- Questions are numbered and ready to use verbatim
- Landmines prevent catastrophic mistakes
- Raw context (company desc, motivation) moves to a collapsed "Background" section
- Objections/risks/action items stay in collapsed "Deep Intel"

### 4. Auto-generate battle card on card render

For leads that already have enrichment data (like Cody Mauri who was already researched), the battle card fields won't exist yet. Two approaches:

- **For 0-meeting leads**: When `enrichmentUpdated` is true or enrichment exists but `openingHook` is missing, show a "Generate Battle Card" button that calls a lightweight AI function to synthesize the existing enrichment into battle card format
- **For meeting leads**: The battle card fields come from `generate-meeting-prep` (which already runs on "Prep Brief" click)

### 5. Fix Deal Room link

Lines 578 and 609 still use `/deal/${lead.id}` — change to `/deal-room/${lead.id}`.

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-meeting-prep/index.ts` | Add 5 battle card fields to tool schema: `openingHook`, `theOneInsight`, `landmines`, `keyQuestions`, `meetingGoal` |
| `supabase/functions/enrich-lead/index.ts` | Add 4 quick-prep fields to enrichment tool schema: `openingHook`, `discoveryQuestions`, `valueAngle`, `watchOuts` |
| `src/components/command-center/PrepIntelTab.tsx` | Redesign IntelCard to lead with battle card zone (opening hook, #1 insight, goal, landmines, questions); move context/deep intel to collapsed sections; fix Deal Room route |

