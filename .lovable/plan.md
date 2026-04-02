

# Prep Intel Card Redesign

## Problems with Current Layout

1. **No information hierarchy**: Company description, prospect quote, enrichment highlights, win strategy, psychological profile, open items, and context grid are all stacked vertically in a flat list — making each card a tall wall of text with no clear "read this first" signal.

2. **Action buttons buried in the middle**: Research Prospect / Draft Email / Deal Room sit between the signal strip and the actual intel content. A sales rep scanning before a call has to hunt for the actionable parts.

3. **Duplicate/scattered enrichment data**: Motivation and urgency appear at the bottom separated from company description and prospect message at the top. Related context is fragmented.

4. **No distinction between "prep to DO" vs "background context"**: Open objections, action items, and risks (the most critical pre-call items) are buried at the very bottom in a 3-column grid that's easy to miss.

5. **For 0-meeting leads** (most common in Prep Intel), the card is mostly empty space with scattered enrichment snippets.

## Redesigned Layout

```text
┌─────────────────────────────────────────────────────┐
│ [Logo] Name [Owner] [Temp]    Thu, Apr 2 at 7:30 PM │
│ Role · Company                                       │
│ [Calendly badge] [meetings] [emails] [$value] [stage]│
├─────────────────────────────────────────────────────┤
│ ⚡ PREPARE                     │ ACTIONS              │
│ • Objection: "Budget concerns" │ [Research Prospect]  │
│ • We owe: Send pricing doc     │ [Draft Pre-Meeting]  │
│ • Risk: Champion may leave     │ [Deal Room →]        │
├─────────────────────────────────────────────────────┤
│ 📋 CONTEXT                                           │
│ Prospect said: "Need support with cold outreach..."  │
│ Company: Dillard Door specializes in security...     │
│ Motivation: Growth through new technologies...       │
│ Urgency: Recent partnership suggests forward...      │
├─────────────────────────────────────────────────────┤
│ ▸ Deep Intel (collapsed: win strategy, psych, grid)  │
└─────────────────────────────────────────────────────┘
```

## Key Changes

### 1. Split card into 3 clear zones

**Zone 1 — "Prepare" + Actions (side by side)**: Left side shows the critical pre-call items (open objections, action items we owe, action items they owe, risks) as a compact checklist. Right side has the action buttons stacked vertically. This ensures a rep sees what matters AND can act on it without scrolling.

**Zone 2 — "Context"**: Prospect message, company description, motivation, urgency grouped together as background reading. No grid — just clean labeled paragraphs.

**Zone 3 — "Deep Intel" (collapsed by default)**: Win strategy, psychological profile, and the metadata grid (buyer type, geo, criteria, etc.) hidden behind a toggle. Only needed for complex deals with existing intel.

### 2. Smarter empty states

For 0-meeting leads with no deal intelligence, skip the "Prepare" zone entirely and lead with the Context zone + prominent Research Prospect button. Don't show empty sections.

### 3. Compact action buttons

Move from full-width dashed-border buttons to a tight vertical button group on the right side of the Prepare zone, saving vertical space.

### 4. Deal Room link fix

Change `/deal/${lead.id}` to `/deal-room/${lead.id}` (still wrong in current code).

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Restructure IntelCard into 3 zones (Prepare+Actions, Context, Deep Intel collapsed); reorder content by actionability; fix Deal Room route |

