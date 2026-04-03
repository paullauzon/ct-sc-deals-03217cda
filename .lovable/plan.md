

# Fix AI Copy Generation Across the Entire System

## The Problem

The `draft-followup` edge function has a single system prompt optimized for **post-meeting follow-up emails**. But it's now being called for 8+ different action types: agenda emails, nudges, objection responses, strategic outreach, re-engagement, prep briefs, NBA actions, and commitment fulfillment emails.

The result: every draft reads like a vague post-meeting follow-up regardless of what's actually needed. "Send agenda & talking points" produces a generic 80-word follow-up instead of an actual agenda with talking points.

## The Fix

### 1. Action-aware system prompts in `draft-followup`

Replace the single system prompt with a prompt selector based on `actionType` (a new field passed in the request body). Each action type gets a purpose-built prompt that generates the right content format.

**Action types and what they should generate:**

| actionType | Output format |
|---|---|
| `agenda` | Subject + 3 numbered agenda items with talking points, time estimate, specific to their deal |
| `post-meeting` | Recap with action items and dates (current behavior, refined) |
| `nudge` | Value-add nudge referencing something new, not "checking in" |
| `objection` | Direct response to the specific objection with evidence/data |
| `re-engagement` | Market insight or trigger event angle, not "we miss you" |
| `commitment` | Fulfillment email delivering what was promised |
| `outreach` | First-touch cold email, sharp and specific |
| `strategic` | Stakeholder expansion or multi-threading email |
| `proposal-followup` | Proposal-specific follow-up with ROI angle |
| `default` | Falls back to current general follow-up prompt |

Each prompt inherits the same P1 rules (no dashes, no banned phrases, max 80 words for emails, specificity) but the output structure and tone differ completely.

### 2. Pass `actionType` from DealRoom

Update `handleDraftPriorityAction` to derive and pass an `actionType` field in the request body so the edge function knows what kind of content to generate.

Mapping logic:
- Playbook tasks: derive from `task.title` keywords ("agenda" → `agenda`, "recap" → `post-meeting`, "check-in" → `nudge`, "re-engage" → `re-engagement`, "breakup" → `re-engagement`)
- `waiting-*` keys → `nudge`
- `objection-*` keys → `objection`
- `strategic-*` keys → `strategic`
- Priority actions: map from `pa.type` (email → `outreach`, dark → `re-engagement`, followup → `post-meeting`, prep → `agenda`)
- Commitment keys → `commitment`
- NBA → derive from action text or default

### 3. Richer context for each action type

The current context passed to the AI is thin. Enhance it per action type:

- **Agenda**: Include meeting date/time, attendees, previous meeting topics, their stated priorities, and service interest
- **Nudge**: Include what they committed to, when, and what's happened since
- **Objection**: Include the exact objection, when it was raised, won deal approach if available
- **Commitment**: Include what was promised, the deadline, and what's being delivered

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/draft-followup/index.ts` | Accept `actionType` field. Add prompt map with 10 purpose-built system prompts. Select prompt based on actionType. Pass richer context to AI. |
| `src/pages/DealRoom.tsx` | Pass `actionType` in every `handleDraftPriorityAction` call body. Derive actionType from the action key/context. Build richer context strings per type. |

