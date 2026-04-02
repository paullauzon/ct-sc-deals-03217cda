

# Transform "Today" into Sales Command Center

## Vision
Replace the current flat Action Queue with a tabbed **Sales Command Center** — the single screen a rep opens every morning to know exactly what to do, in what order, and with what context. Think of it as the cockpit view: meetings, follow-ups, deal momentum, and prep intelligence — all in one place.

## Structure: 4 Tabs

```text
┌──────────────────────────────────────────────────────────────────┐
│  COMMAND CENTER          Owner: [All ▾]     ⌘K Search...        │
├──────────┬────────────┬────────────┬─────────────────────────────┤
│ Schedule │ Follow-Ups │ Deal Pulse │ Prep Intel                  │
└──────────┴────────────┴────────────┴─────────────────────────────┘
```

### Tab 1: Schedule (default)
The current meetings hero + action tiers, refined:
- **Today's Agenda**: Meetings happening today shown as large prominent cards with full context (brand, company, event name, duration, time, deal value, stage, assigned owner). Meeting prep brief link if available.
- **Upcoming Meetings** (7/14/30d toggle): Grouped by This Week / Next Week / Later — existing card layout.
- **Priority Tiers** (Urgent / At Risk / Monitor): The existing collapsible action rows, unchanged.
- **Summary Stats Bar**: Existing clickable counts.

### Tab 2: Follow-Ups (new)
A dedicated task-oriented list of everything that needs outbound action:
- **Overdue Follow-Ups**: Leads past their `nextFollowUp` date, sorted by days overdue. Shows lead name, company, stage, days overdue, last contact date, deal value.
- **Due Today / This Week**: Leads with `nextFollowUp` within the next 7 days.
- **Untouched New Leads**: New leads with no `assignedTo` or `lastContactDate`, sorted by age.
- **Going Dark**: Leads with 21+ days since last contact (not in closed stages), sorted by silence duration.
- Each row has a quick-action button: "Mark Contacted" (updates `lastContactDate` to now).

### Tab 3: Deal Pulse (new)
At-a-glance health of all active deals, no clicking required:
- **Pipeline Snapshot**: 4 mini KPIs — Active Deals, Total Pipeline Value, Avg Days in Stage, Meetings This Week.
- **Momentum Board**: A compact table of all active deals sorted by risk, showing: Name, Stage, Days in Stage (color-coded: green < 7, yellow 7-14, red 14+), Deal Value, Momentum indicator (from deal intelligence if available), Last Contact, Next Follow-Up.
- **Stalled Deals Alert**: Deals 14+ days in stage with no recent contact — highlighted rows.
- **Renewals Coming Up**: Closed Won deals with `contractEnd` within 60 days.

### Tab 4: Prep Intel (new)
Pre-meeting intelligence for leads with upcoming meetings:
- For each lead with a meeting in the next 7 days, show a compact intel card:
  - Company, role, brand, meeting time
  - Key enrichment highlights: `companyDescription`, `buyerMotivation`, `urgency` (from `enrichment`)
  - Deal signals if available: buying intent, sentiment, objections count, champion identified
  - Open action items from `dealIntelligence.actionItemTracker` (status = "Open")
  - Unresolved objections from `dealIntelligence.objectionTracker` (status = "Open")
  - Meeting prep brief summary if `meetings` array has a prep brief
- This gives the rep everything they need without opening individual lead panels.

## Technical Details

### State Management
- Add `commandTab` state: `"schedule" | "followups" | "pulse" | "intel"`
- Persist in URL hash as `&ctab=schedule`
- Reuse existing `ownerFilter` across all tabs

### Data Derivation
All data comes from existing `leads` array — no new DB queries needed:
- Follow-ups: filter by `nextFollowUp` date ranges
- Deal Pulse: filter active stages, compute metrics from lead fields
- Prep Intel: filter leads with `meetingDate` in next 7 days, read `enrichment` and `dealIntelligence` JSONB fields

### Component Structure
- `ActionQueue.tsx` becomes the container with tab switcher
- Extract `ScheduleTab` (current content, mostly unchanged)
- New `FollowUpsTab` component inline
- New `DealPulseTab` component inline  
- New `PrepIntelTab` component inline
- All within the same file to keep it self-contained (can extract later if too large)

## Files Changed
| File | Change |
|------|--------|
| `src/components/ActionQueue.tsx` | Add 4-tab structure, new Follow-Ups / Deal Pulse / Prep Intel sections, rename header to "Command Center" |
| `src/pages/Index.tsx` | Update nav item label from "Today" to "Command Center" (and desc) |

