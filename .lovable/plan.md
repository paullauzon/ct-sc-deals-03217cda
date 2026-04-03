

# Make Every Action Executable with AI Drafting

## Problem

Three sections in the Actions tab are passive — no buttons, no way to act:

1. **Playbook Tasks** — Shows "Send agenda & talking points" with a due date but no Draft button
2. **Waiting on Them** — Shows what the prospect owes but no "Nudge" button to draft a gentle follow-up
3. **Strategic Actions** — Shows "Identify a champion" or "Multi-thread" but no way to draft an outreach

Additionally, the **Next Best Action** card (shown when no priority actions exist) has no Draft button either.

## Solution

Add contextual Draft buttons to every section, using the same `handleDraftPriorityAction` pattern already proven in Priority Actions and Objections.

### 1. Playbook Tasks — Add "Draft" button

Each playbook task that has `task_type: "email"` gets a Draft button. The context sent to AI includes the task title, description, and stage.

### 2. Waiting on Them — Add "Nudge" button

Each prospect-owed item gets a "Draft Nudge" button. The AI context explains: "The prospect committed to [item] and hasn't delivered. Draft a gentle nudge that adds value rather than just asking."

### 3. Strategic Actions — Add "Draft" button

Strategic actions like "Identify a champion" or "Multi-thread the deal" get a Draft button. The AI context explains the strategic goal and asks for an email that advances it (e.g., reaching out to another stakeholder).

### 4. Next Best Action — Add "Draft" button

The standalone NBA card gets a Draft button using `handleDraftPriorityAction` with `type: "nba"` and the action text as context.

### State management

All new drafts use the existing `draftingPriority` / `draftedPriorityEmails` state with unique keys:
- Playbook: `playbook-{task.id}`
- Waiting: `waiting-{index}`
- Strategic: `strategic-{index}`
- NBA: `nba`

### Draft display

Same inline pattern as Priority Actions — AI Draft card appears below the action with Copy button.

## Files Changed

| File | Changes |
|------|---------|
| `src/pages/DealRoom.tsx` | Add Draft buttons to Playbook Tasks (email types), Waiting on Them (Nudge), Strategic Actions, and Next Best Action. All use `handleDraftPriorityAction` with rich contextual prompts. Show inline drafted emails with Copy button using existing state pattern. |

