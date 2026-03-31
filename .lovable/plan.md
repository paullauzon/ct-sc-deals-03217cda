

# Redesign Action Queue for At-a-Glance Efficiency

## Current Problems
- Everything in one flat list sorted by urgency — hard to scan
- Meetings (only 3) buried among 174 items
- No visual hierarchy between "act now" vs "monitor"
- No Calendly meeting details shown (event name, duration, time)
- Repetitive detail lines waste space

## New Layout: Grouped Sections with Priority Tiers

```text
┌──────────────────────────────────────────────┐
│ Action Queue                    [Owner ▾] All│
│ 174 items needing attention                  │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ TODAY'S MEETINGS (3)           blue dot  │ │
│ │ ┌─ Card: Name · Company · Meeting TODAY ─│ │
│ │ │  CalendarCheck "SourceCo Intro · 30m"  │ │
│ │ │  "2:00 PM"                             │ │
│ │ └─────────────────────────────────────────│ │
│ │ (horizontal scroll or 3-col grid)        │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ── URGENT (Overdue + Renewals) ────── count ─│
│  [ collapsed list of items ]                 │
│                                              │
│ ── AT RISK (Going Dark + Untouched) ─ count ─│
│  [ collapsed list of items ]                 │
│                                              │
│ ── MONITOR (Stale) ──────────────── count ─  │
│  [ collapsed list of items ]                 │
└──────────────────────────────────────────────┘
```

## Key Changes

### 1. Meetings Section — Top Hero Cards
- Pull meetings out of the flat list into a dedicated top section
- Show as compact cards (not list rows) with Calendly event name, duration, and scheduled time
- "Meeting TODAY" gets a pulsing blue dot; future meetings show day label
- Cards are clickable to open lead detail

### 2. Grouped Priority Tiers (Collapsible)
Replace the flat list + filter chips with 3 collapsible sections:
- **Urgent** (red): Overdue follow-ups + Renewals — requires immediate action
- **At Risk** (amber): Going Dark + Untouched — needs intervention soon  
- **Monitor** (gray): Stale deals — awareness items

Each section header shows count and total deal value. Sections default to expanded but can collapse.

### 3. Compact Row Design
Each row keeps: brand logo, name, owner avatar, action label, deal value. Remove the second detail line — the brand border + logo already conveys brand, and stage info is in the label.

### 4. Filter Chips Remain
Keep the type filter chips but move them inline as sub-filters within each section, or keep at top for cross-section filtering. Owner dropdown stays.

### 5. Summary Stats Bar
Add a small stats bar below the header:
```
75 Overdue · 3 Meetings · 62 Going Dark · 7 Untouched · 27 Stale
```
Clickable to jump/scroll to that section.

## Files Changed
| File | Change |
|------|--------|
| `src/components/ActionQueue.tsx` | Full restructure: meetings hero section, grouped collapsible tiers, compact rows, summary stats |

