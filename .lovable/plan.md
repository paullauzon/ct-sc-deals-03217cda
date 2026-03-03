

# Add Deal Owners: Malik, Valeria, Tomos

## Changes

### 1. `src/types/lead.ts`
Add a `DealOwner` type: `"Malik" | "Valeria" | "Tomos" | ""`. Keep `assignedTo` as the field but constrain it to this type.

### 2. `src/components/LeadsTable.tsx`
- Replace the free-text `assignedTo` Input with a `Select` dropdown offering Malik, Valeria, Tomos (and an empty "Unassigned" option).
- No changes to the table columns needed — `assignedTo` already exists.

### 3. `src/components/Pipeline.tsx` — Redesigned deal cards
Make the owner immediately visible at a glance. New card layout:

```text
┌─────────────────────────────┐
│ CT  John Smith         M    │  ← brand badge, name, owner initial (single letter)
│ Acme Corp · Partner         │
│ SC · Intro Call             │
│ Off-Market Email Orig.      │  ← service interest (if set)
│ $50,000          High       │  ← value + priority
│ 12d in stage                │
└─────────────────────────────┘
```

The owner initial appears as a small circle with the first letter (M/V/T) in the top-right corner of the card. This gives instant visual recognition of who owns each deal without adding clutter. Unassigned leads show a subtle "?" circle to flag they need assignment.

### 4. `src/components/Dashboard.tsx`
Add an "Owner Breakdown" section showing leads per owner with pipeline value, so managers can see workload distribution at a glance.

### 5. Data defaults
All existing leads default to `assignedTo: ""` (unassigned). The owner can be set per-lead via the detail panel.

## Files Changed

| File | Changes |
|------|---------|
| `src/types/lead.ts` | Add `DealOwner` type |
| `src/components/LeadsTable.tsx` | Replace assignedTo Input with Select dropdown (Malik, Valeria, Tomos) |
| `src/components/Pipeline.tsx` | Add owner initial circle to top-right of each card |
| `src/components/Dashboard.tsx` | Add Owner Breakdown section with per-owner metrics |

