

# Make Objections Hyper-Actionable

## Problem

Objection cards currently show just the objection text plus a status badge ("Open" / "Recurring"). No context on where it was raised, no guidance on how to handle it, and no way to act. The salesperson sees "Nature of leads (cold vs. warm)" and thinks "...so what do I do about it?"

## Solution

Enrich each objection card with three layers of context:

1. **Where it came from**: Show `raisedIn` (the meeting where it was raised) so the rep knows the context
2. **How similar deals handled it**: Use the existing `getObjectionPlaybook()` function which cross-references won deals that addressed similar objections and returns the resolution approach + deal name
3. **Draft response button**: Add a "Draft Response" button that calls `draft-followup` with objection-specific context so the rep can generate a targeted email addressing the specific concern

### Card layout per objection:

```text
┌──────────────────────────────────────────────────┐
│ "Nature of leads (cold vs. warm)"      Recurring │
│ Raised in: Introductory Call                     │
│                                                  │
│ Won deal approach: [Company X] addressed this    │
│ by showing warm lead conversion metrics          │
│                                        [Draft]   │
└──────────────────────────────────────────────────┘
```

## Implementation

**`src/pages/DealRoom.tsx`** — Objections section (~lines 705-723):

1. Import `getObjectionPlaybook` from `dealHealthUtils`
2. Compute playbook matches and create a lookup map keyed by objection text
3. For each objection card, add:
   - `raisedIn` line (e.g., "Raised in: Introductory Call") when available
   - If a playbook match exists: show "Similar deal handled this: [resolution]" with the won deal name
   - A "Draft Response" button that calls `handleDraftPriorityAction` with type `objection-{index}` and context including the specific objection text
4. Add `objection-*` handling to `handleDraftPriorityAction` context map
5. Track drafted objection emails in `draftedPriorityEmails` using `objection-{index}` keys

## Files Changed

| File | Changes |
|------|---------|
| `src/pages/DealRoom.tsx` | Import `getObjectionPlaybook`. Enrich objection cards with raisedIn, playbook match, and Draft Response button with inline email display. |

