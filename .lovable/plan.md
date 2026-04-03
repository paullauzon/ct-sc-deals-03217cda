

# Pipeline Cards: Human-Readable Intelligence + Layout Fix

## Problems

1. **"50" means nothing** — a salesperson doesn't know if 50 is good or bad. Same for "Multi-threaded" and "Steady" — jargon badges with no context.
2. **"Concerns about ti..."** overlaps with icons on Row 4 — the closing insight text competes for space with LinkedIn/Calendly/meetings icons on the same line.
3. **LinkedIn icon** should be blue again (`text-[#0A66C2]`).

## Design Approach

Replace jargon badges with human-readable labels a salesperson instantly understands. Move closing insight to its own row so it never overlaps.

### Badge Translations

| Current | New Label | Why |
|---------|-----------|-----|
| `50` (health score) | `Health: 50/100` | Context for what the number means |
| `Multi-threaded` | `3 stakeholders` | Concrete count, not abstract concept |
| `Single-threaded` | `1 contact` | Clear warning without jargon |
| `No Champion` | `No advocate` | Plainer English |
| `→ Steady` | `Steady pace` | Remove arrow, add noun |
| `↑ Accelerating` | `Gaining speed` | Action-oriented |
| `↓ Stalling` / `↓ Stalled` | `Losing steam` / `Gone quiet` | Urgent but not alarming |

### Layout Fix for Closing Insight

Move the closing insight text from Row 4 (where it fights for space with icons) to **its own line below Row 4**, displayed as a full-width subtle italic line. This eliminates all truncation/overlap issues.

```
Row 4: 15d in stage          [in] [ff] 2 Held
Row 4b:  "Concerns about timeline and pricing"   ← new, full width
Row 5: Health: 50/100 · 3 stakeholders · Steady pace
Row 6: [3 pending actions          Follow-up Mar 24  >]
```

### LinkedIn Icon

Restore `text-[#0A66C2]` — it's a recognized brand affordance that helps salespeople spot the link instantly.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Move closing insight to its own row below Row 4. Replace health score badge with `Health: N/100`. Replace coverage labels with stakeholder count. Replace momentum labels with plain English. Restore LinkedIn blue. |
| `src/lib/dealHealthUtils.ts` | Update `getStakeholderCoverage` return to include `count` of stakeholders for display |

