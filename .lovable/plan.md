

# Pipeline Cards: Premium Monochrome Redesign

## What's Wrong

The cards use a patchwork of colors that clash with the premium aesthetic:
- **Deal Health**: Emerald/amber/red backgrounds with Heart icon — looks like a health app
- **Stakeholder Coverage**: Green "Multi-threaded" / red "No Champion" — traffic light colors
- **Aging borders**: Red/orange/yellow animated pulse borders on cards
- **LinkedIn icon**: Bright blue `#0A66C2` — brand color that breaks monochrome
- **Closing insight**: Random icons (Zap, Target, Timer, BarChart3) with no clear meaning
- **Tooltip**: Basic text dump of health factors

## Redesign Principles

All badges use `bg-secondary text-foreground/70` or `text-muted-foreground`. No semantic colors. Differentiation through typography weight and subtle opacity, not color. Icons removed where they add no clarity.

## Changes

### 1. Remove aging border colors (lines 82-87)
Replace `getAgingClass` — no red/orange/yellow borders. All cards use `border-border`. Cards with 21+ days get `border-foreground/30` (slightly more visible, no color, no pulse).

### 2. Deal Health badge (lines 419-436)
- Remove Heart icon and colored backgrounds
- Show as monochrome: `bg-secondary text-foreground/70` for all scores
- Score number alone is enough: `50` not `♥ 50`
- Tooltip redesign: clean layout with `font-mono` score, label, and factors as a minimal list with `+`/`-` prefixes

### 3. Stakeholder Coverage (lines 438-443)
- Remove ShieldAlert/Users icons and all color classes
- All use `bg-secondary text-muted-foreground`
- "No Champion" stays as text but no red — differentiated by the text itself
- "Multi-threaded" / "Single-threaded" — plain monochrome badges

### 4. LinkedIn icon (line 384)
- Remove `text-[#0A66C2]` — use `text-muted-foreground hover:text-foreground`

### 5. Closing insight icons (lines 40-59)
- Remove Zap/Target/Timer/BarChart3 icons — just show the text truncated, the content speaks for itself

### 6. Card information flow restructure

Current order is scattered. Restructure for a salesperson's scan pattern:

**Row 1**: Name + Owner (unchanged — this is correct)
**Row 2**: Company · Role + Submissions/Associates (unchanged)
**Row 3**: Value + Priority (unchanged)
**Row 4**: Days in stage + Calendly/Meetings + LinkedIn (unchanged, minus colors)
**Row 5**: Intelligence badges — Score · Coverage · Momentum · AI (all monochrome, same row)
**Row 6**: Action CTA (pending actions chip — unchanged, already good)

### 7. Tooltip styling
Tooltip for deal health gets a cleaner design: score as large number, label below, factors with monochrome `+`/`-` indicators, no colored text.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Remove all semantic colors from badges, icons, and borders. Monochrome everything. Remove decorative icons from health/coverage/insight. Clean tooltip layout. LinkedIn to muted color. |

