

# Pipeline Cards: At-a-Glance Closing Insight

## What to Show

As a veteran sales/revops strategist, the single most valuable line on a deal card is **the one thing standing between you and the close**. Not a summary — a *closing signal*.

The priority hierarchy for selecting that line:
1. **Top unresolved objection** — if there's a blocker, that's what you need to know
2. **#1 pain point** — what's driving them to buy
3. **Timeline/urgency signal** — when they need to move
4. **Buying intent + sentiment** — fallback composite signal

## How It Works

Extract from the **latest meeting's `intelligence`** (most recent = most relevant):
- Check `dealSignals.objections[0]` → show as "⚡ Objection: ..."
- Else check `painPoints[0]` → show as "🎯 Need: ..."
- Else check `dealSignals.timeline` if not empty → show as "⏱ Timeline: ..."
- Else show `dealSignals.sentiment` + `buyingIntent` as a compact badge

Truncate to ~60 chars max. Italic, muted style, single line.

## Implementation

| File | Change |
|------|--------|
| `src/components/Pipeline.tsx` | Add a helper function `getClosingInsight(lead)` that extracts the top signal from the latest meeting with intelligence. Render it as a new row on the card between the value/priority row and the days-in-stage row. |

Single file change. No edge functions or type changes needed — all data already exists in `MeetingIntelligence`.

