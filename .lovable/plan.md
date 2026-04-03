

# The "8 Next Steps" → Actions Tab Disconnect

## The Core Problem

The pipeline card says **"8 next steps"** — computed from 15 signal sources (unanswered emails, dropped promises, open objections, going dark, no champion, meeting prep, sentiment decline, etc.). But when the salesperson clicks through to the Deal Room Actions tab, they only see:

1. **Next Best Action** — a single AI recommendation
2. **Open Actions** — transcript-extracted action items from `actionItemTracker` only

That's maybe 3-4 items. The other 4-5 signals that inflated the count to 8 (unanswered email, going dark, no champion, open objections, overdue follow-up, stale lead, sentiment, high intent) **don't appear anywhere on the Actions tab**. The card promises 8 things; the destination shows 3. The salesperson lands and thinks "where's the rest?"

## What Needs to Change

Rebuild the Deal Room Actions tab as a **unified action queue** that mirrors exactly what the pipeline card tooltip shows — every signal that contributes to the count gets its own actionable card on this tab, grouped by type and ordered by priority.

### Actions Tab Structure (top to bottom)

```text
┌─────────────────────────────────────────────┐
│ PRIORITY ACTIONS                            │
│ ┌─────────────────────────────────────────┐ │
│ │ Reply to email   "Re: acquisition..."   │ │
│ │ Received Mar 28 · awaiting your reply   │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Re-engage — 12d since last contact      │ │
│ │ Deal is going dark in active stage      │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Prep for meeting Apr 5                  │ │
│ │ No prep brief generated yet             │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ OPEN COMMITMENTS (3)                        │
│  ○ Send overview of meeting discussion...   │
│  ○ Schedule follow-up with Tomos            │
│  ○ Send refined acquisition criteria...     │
├─────────────────────────────────────────────┤
│ WAITING ON THEM (1)                         │
│  Michael owes: "Send refined acquisition    │
│  criteria/buy box"                          │
├─────────────────────────────────────────────┤
│ OBJECTIONS TO ADDRESS (2)                   │
│  • Timeline concerns                        │
│  • Success fee structure                    │
├─────────────────────────────────────────────┤
│ STRATEGIC ACTIONS                           │
│  • Find a champion (no advocate identified) │
│  • Sentiment declining — was Positive,      │
│    now Cautious                             │
├─────────────────────────────────────────────┤
│ ✓ 2 completed                          ▸   │
└─────────────────────────────────────────────┘
```

### Implementation

**`src/pages/DealRoom.tsx` — Actions tab overhaul:**

1. Import `getUnifiedActionCount` and compute it for the current lead (same way Pipeline does, passing unanswered email status and meeting prep flag)
2. Replace the current flat list with **grouped sections**, each corresponding to a signal category:
   - **Priority Actions**: Unanswered email, going dark, meeting prep, overdue follow-up, stale new lead, contract renewal — each as a distinct card with context and a suggested action
   - **Open Commitments**: Current `openActions` list (our action items from transcripts) — keep Draft button
   - **Waiting on Them**: Prospect-owned items from `actionItemTracker` — shown separately with "Nudge" framing
   - **Objections to Address**: Open/Recurring objections from `objectionTracker` — each with the objection text
   - **Strategic Actions**: No champion, sentiment declining, high intent, log meeting outcome — lower urgency but important
   - **Next Best Action**: Keep at top as a highlight card, but only when it adds info not already covered by the sections above
3. Each section only renders if it has items — no empty sections
4. The tab count badge `Actions (N)` uses the unified total so it matches the pipeline card

**`src/hooks/useUnansweredEmails.ts`** — already exists, needs to be imported into DealRoom

**No changes to `dealHealthUtils.ts`** — all the logic already exists, the Actions tab just doesn't use it.

### Key Design Decisions

- **No colored urgency borders** — follow the monochrome premium design. Use subtle `bg-secondary` cards with clear text hierarchy instead
- **"Waiting on Them" is separate** — salespeople need to instantly see what they're blocked on vs. what they need to do. This was buried before
- **Objections get their own section** — currently only visible in the sidebar. Surfacing them as action items ("address this objection") makes them executable
- **Tab count matches card count** — eliminates the disconnect entirely. If the card says 8, the tab shows 8 distinct items across sections

## Files Changed

| File | Changes |
|------|---------|
| `src/pages/DealRoom.tsx` | Rebuild Actions tab with grouped sections: Priority Actions, Open Commitments, Waiting on Them, Objections to Address, Strategic Actions. Import and compute `getUnifiedActionCount`. Use unified total for tab badge. |

