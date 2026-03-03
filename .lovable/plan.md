

# Deep Psychological Deal Intelligence — The Differentiator

## What's Missing Today

The current system is excellent at **operational intelligence** — stakeholders, objections, actions, risks, milestones. But it's completely blind to the **human layer** — the psychology that actually closes deals. Every veteran closer knows: people don't buy solutions, they buy outcomes for *themselves*.

## New Intelligence Dimensions

### 1. **Stakeholder Psychographics** (per person in stakeholder map)
- **Personal Win Condition**: What does closing this deal mean for THEM personally? (Promotion path, board validation, career safety, looking smart to their boss)
- **Career Risk Tolerance**: Are they a safe-bet player or a risk-taker? Will they stick their neck out?
- **Communication Style**: Analytical (wants data), Driver (wants results), Amiable (wants consensus), Expressive (wants vision)
- **Decision Trigger**: What will make them say yes — ROI proof, peer validation, executive pressure, fear of missing out?
- **Hidden Concern**: What they're NOT saying but you can infer from their questions, tone, and behavior

### 2. **Power Dynamics Map** (new section)
- Who has REAL influence vs. title authority
- Relationship tensions between stakeholders (e.g., CFO skeptical but CEO pushing)
- Internal politics at play
- Who needs to be won over and in what order

### 3. **Psychological Closing Strategy** (new section)
- **The Real "Why"**: What's actually driving this purchase at a human level (not just business case)
- **Fear Factor**: What happens to the champion/DM if they DON'T buy? What are they afraid of?
- **Trust Level**: How much do they trust us? Evidence from transcripts
- **Emotional Triggers**: What language/framing resonated most? What made them lean in?
- **The Unspoken Ask**: What they want but haven't directly said (reading between the lines)
- **Recommended Approach**: Specific psychological approach for the next interaction

### 4. **Win Strategy Brief** (new section)
- **#1 Thing That Closes This Deal**: One sentence — the single most important thing
- **Landmines to Avoid**: Topics, phrases, or approaches that could kill this deal
- **Power Move**: The strategic action that would dramatically accelerate this deal
- **Relationship Leverage**: Who to activate, who to neutralize, what relationships to build

## Implementation

### Files Changed

| File | Changes |
|------|---------|
| `src/types/lead.ts` | Add new fields to `StakeholderProfile` (personalWin, careerRisk, commStyle, decisionTrigger, hiddenConcern). Add `PowerDynamics`, `PsychologicalProfile`, `WinStrategy` interfaces to `DealIntelligence`. |
| `supabase/functions/synthesize-deal-intelligence/index.ts` | Massively upgrade the system prompt to think as a master psychologist. Add new tool call properties for all new dimensions. |
| `src/components/DealIntelligencePanel.tsx` | Add 3 new tabs: "Psychology" (stakeholder psychographics + power dynamics), "Win Strategy" (closing playbook + emotional triggers), and enhance the existing Stakeholders tab with psychographic badges. |

### System Prompt Enhancement (Edge Function)

The prompt will be upgraded from "FBI intelligence analyst" to also include:
- Master organizational psychologist analyzing career motivations
- Hostage negotiator reading between the lines for hidden signals
- Political strategist mapping internal power dynamics
- Behavioral economist identifying cognitive biases at play

The AI will be instructed to infer psychological dimensions from: question patterns, objection framing, what they emphasize vs. avoid, meeting attendance patterns, engagement level changes, language choices, and timing signals.

### UI Design

**Enhanced Stakeholder Cards**: Each stakeholder gets small badges for communication style and a one-line "Personal Win" beneath their concerns.

**New "Psychology" Tab**: Shows power dynamics narrative, trust trajectory, emotional triggers list, and "The Unspoken Ask" callout box.

**New "Win Strategy" Tab**: Bold "#1 thing that closes this deal" at top, then landmines, power move, and relationship leverage in a clean card layout. This is the tab a salesperson opens 30 seconds before a call.

