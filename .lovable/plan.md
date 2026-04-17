

## Goal

Move the 8 quick-action buttons (Email, Schedule, Note, Task, Draft AI, Log call, Enrich, Ask AI) out of the header and into the **left rail** (contact profile), HubSpot-style. This makes the left rail a true "contact dossier" — identity, actions, and properties all in one panel — and reclaims vertical space in the header for the deal narrative and stage progression.

## Reference (from your screenshots)

Screenshot 2 shows the HubSpot pattern: avatar → name → role/company → quick action chips (Note · Email · Call · Task · Meeting) → "Actions ▼" overflow → collapsible property sections (Identity, Buyer Profile…). That's the target shape, adapted to our existing visual language (monochrome, no colored dots, Lucide icons).

## Layout changes

### 1. Left rail (`LeadPanelLeftRail.tsx`) — new top section

New stack at the top of the rail, replacing the current "About" label:

```text
┌─ AboutCard (refactored IdentityCard) ─────────┐
│         [Avatar]                              │
│         Name                                  │
│         Role · Company                        │
│   [Brand chip] [Stage chip] [Status chip]    │
│                                               │
│   ┌─ Quick actions (2 rows of 4) ──────┐    │
│   │ [Email] [Schedule] [Note] [Task]   │    │
│   │ [Call]  [Draft AI][Enrich][Ask AI] │    │
│   └────────────────────────────────────┘    │
│                                               │
│   ┌─ More ▾ ──────────────────────────┐    │
│   │ Copy link · Copy summary · Archive │    │
│   └────────────────────────────────────┘    │
│                                               │
│   ─── Contact ─────────────────────────       │
│   ✉  email@…              [copy]              │
│   ☎  phone                [copy]              │
│   🌐 domain.com           [open]              │
│   in LinkedIn profile     [open]              │
└───────────────────────────────────────────────┘
```

Then the existing `Key Information`, `Deal Economics`, `Mutual Plan`, etc. cards continue below unchanged.

**Action button style:** square-ish tiles (icon over label), 2×4 grid, monochrome (`bg-secondary/40 hover:bg-secondary`), Lucide icons, no colored dots — keeps the premium B&W aesthetic per your design memory.

### 2. Header (`LeadPanelHeader.tsx`) — slimmed down

Remove the entire `Quick action bar` row (lines 406–426). Header keeps:
- Identity row (avatar + name + intelligence chips: health, momentum, win%, slip-risk)
- "Days in stage · $value · Last contact" meta strip
- Prev/Next, Copy link, Copy summary, Shortcuts, Maximize, More, Close (top-right cluster — unchanged)
- Clickable stage progress bar

This shrinks header from ~3 rows to ~2 rows, giving more vertical room to the workspace tabs.

### 3. New: rail width tweak

Bump left rail from `w-[300px]` → `w-[320px]` so 4 action tiles per row fit comfortably with labels.

## What else to add (small, high-leverage additions)

Since we're already restructuring the profile panel:

1. **Contact owner inline** — show "Owner: Malik" with quick reassign dropdown right under the contact info (currently buried in Key Information).
2. **Last touchpoint chip** — "Last contact 3d ago · Email" right above quick actions, so the rep sees recency before deciding which action to fire.
3. **Smart action highlighting** — the next-best action gets a subtle ring (e.g., if `nextFollowUp` is overdue, highlight `Email`; if no meeting booked, highlight `Schedule`). Driven by existing `next-steps engine` logic. Premium-monochrome — uses a 1px foreground ring, not a color.
4. **"More" overflow menu** — bundles low-frequency actions (Copy link, Copy summary, Archive, Keyboard shortcuts) into a single dropdown to keep the action grid clean at exactly 8 primary actions.

## Files touched

- `src/components/dealroom/IdentityCard.tsx` — extend to render the quick actions grid + smart highlight + last-touchpoint chip + More overflow. Accepts new props (`onEmail`, `onSchedule`, `onNote`, `onTask`, `onDraftAI`, `onLogCall`, `onEnrich`, `onAskAI`, `onArchive`, `onCopyLink`, `onCopySummary`, `draftingAI`, `enriching`).
- `src/components/lead-panel/LeadPanelLeftRail.tsx` — pass action handlers through to `IdentityCard`; bump width to 320px.
- `src/components/lead-panel/LeadPanelHeader.tsx` — remove quick-action row; remove now-unused props from interface.
- `src/components/LeadDetailPanel.tsx` — wire the action callbacks down through `LeadPanelLeftRail` instead of `LeadPanelHeader`. Keep keyboard shortcuts working (they call the same handlers).

No new files. No schema changes. ~150 lines moved/refactored.

## Trade-offs

- **Win:** Profile panel becomes self-sufficient — rep can see the contact AND act on them without eye-jumping to the top bar. Matches CRM industry convention (HubSpot, Salesforce, Attio).
- **Win:** Header feels lighter and the deal narrative (stage progress + intelligence chips) gets visual priority.
- **Loss:** When the left rail is collapsed (`[` shortcut), actions disappear too. **Mitigation:** keep a slim icon-only action strip in the header that appears *only* when the left rail is collapsed (`!leftOpen ? <CompactActionStrip /> : null`). Best of both worlds.
- **Loss:** Two extra rail-width pixels (300→320). Negligible at 1394px viewport.

## Sequence

1. Refactor `IdentityCard` → accept action props, render grid + last-touchpoint + More menu + smart-highlight.
2. Update `LeadPanelLeftRail` to pass props through and bump width.
3. Strip quick-action row from `LeadPanelHeader`; add the collapsed-rail compact strip.
4. Update `LeadDetailPanel` wiring.
5. You verify the flow end-to-end: open a lead, fire each action, collapse left rail and confirm compact strip appears, test `e/c/m/n/t` keyboard shortcuts still work.

