

# HubSpot-Style Lead Workspace — Full-Screen Rebuild

## What changes
Rebuild `DealRoom.tsx` from a constrained 1600px 3-column layout into a **full-screen, full-bleed workspace** that mirrors HubSpot's record view, but tuned for what we *actually* do: M&A advisory deal tracking, meeting recordings (Fireflies), email threads (Zapier + future Outlook/Gmail), AI deal intelligence, and the Next Steps Engine.

No new backend. Pure UI rebuild that re-organizes what we already have into a denser, more scannable, more useful layout.

## Layout — full bleed, three columns

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: avatar · name · brand · stage · health · momentum · owner · prev/next · ⋯  │
│ DEAL PROGRESS BAR (8 active stages)                                                 │
├──────────────────┬──────────────────────────────────────────────┬───────────────────┤
│ LEFT (320px)     │ CENTER (flex)                                │ RIGHT (340px)     │
│ Identity panel   │ Quick-action bar (Email · Meeting · Note ·   │ Deal Health card  │
│  - Avatar        │   Task · Log call · Draft AI)                │  (score, trend)   │
│  - Name/title    │ ───────────────────────────────────────────  │ Stakeholder Map   │
│  - Brand badge   │ TABS: Activity · Actions · Meetings ·        │ Risks             │
│  - Email/phone   │       Emails · Intelligence · Files · Notes  │ Open Commitments  │
│  - LinkedIn      │ ───────────────────────────────────────────  │ Win Strategy      │
│  - Company link  │ [ Sub-tab content with timeline-first view ] │ Buying Committee  │
│                  │                                              │ Similar Won deals │
│ Key Information  │                                              │ Deal Narrative    │
│  - Stage         │                                              │                   │
│  - Priority      │                                              │ (Collapsible      │
│  - Forecast      │                                              │  cards, scrolls   │
│  - ICP Fit       │                                              │  independently)   │
│  - Owner         │                                              │                   │
│  - Service       │                                              │                   │
│  - Deal value    │                                              │                   │
│  - Subscription  │                                              │                   │
│                  │                                              │                   │
│ Email Activity   │                                              │                   │
│  (EmailMetrics)  │                                              │                   │
│                  │                                              │                   │
│ Engagement       │                                              │                   │
│  - Days in stage │                                              │                   │
│  - Last contact  │                                              │                   │
│  - Next followup │                                              │                   │
│  - Submissions # │                                              │                   │
│                  │                                              │                   │
│ M&A Criteria     │                                              │                   │
│  (SourceCo only) │                                              │                   │
│                  │                                              │                   │
│ Dates & Contract │                                              │                   │
└──────────────────┴──────────────────────────────────────────────┴───────────────────┘
```

- Container: `w-full` (no max-width clamp). Three columns are fixed/flex/fixed.
- Each column scrolls independently — center stays anchored when sidebars overflow.
- Left/right columns fully collapsible (chevron toggle, like HubSpot's panel toggle).
- Header is sticky.

## Center workspace — tabs tuned for our workflow

Replace current tab set with HubSpot-style "Activity sub-tabs" pattern:

| Tab | What lives here | Why we need it |
|---|---|---|
| **Activity** *(default)* | Unified chronological timeline merging meetings, emails, stage changes, notes, Calendly bookings, submissions. Filter chips: All · Emails · Meetings · Stage · Notes · System | Replaces current bare "Timeline" tab — becomes the spine of the record |
| **Actions** | Existing priority/commitment/objection/playbook/strategic stack (already built — keep verbatim) | Keep — this is our killer differentiator |
| **Meetings** | Existing MeetingsSection — recordings, transcripts, prep briefs | Keep — Fireflies-powered |
| **Emails** | Existing EmailsSection (HTML view, attachments, replies) | Keep |
| **Intelligence** | Existing DealIntelligencePanel | Keep |
| **Files** *(new, lightweight)* | Google Drive link surfacing + meeting attachments aggregated | We already track `googleDriveLink` — make it visible |
| **Notes** | Existing notes textarea | Keep |

Removed (consciously, per your guidance):
- ~~Playbooks tab~~ — playbook tasks live inside Actions
- ~~Tickets~~ — not our use case
- ~~Subscriptions / website activity~~ — not relevant
- ~~Calls sub-tab~~ — we don't log calls separately; meetings cover it

## Top bar — quick-action row (HubSpot parity)

Below the existing identity row, add a horizontal quick-action strip:

```
[ ✉ Email ] [ 📅 Schedule ] [ 📝 Note ] [ ✓ Task ] [ ⚡ Draft AI ] [ 📞 Log Call ]
```

- **Email** → opens compose/draft drawer (drafts already supported via `lead_drafts`)
- **Schedule** → opens Calendly link / shows next available
- **Note** → inline note appender (writes to `notes` field + activity log)
- **Task** → adds to `lead_tasks`
- **Draft AI** → triggers next-best-action draft (already exists)
- **Log Call** → quick-form to log a call as activity

## Right rail — premium intelligence cards

Replace current right column with a vertical stack of compact cards (HubSpot's "associated records" pattern, adapted for our data):

1. **Deal Health** (large, top) — score, label, sparkline of momentum trajectory
2. **Stakeholders** — existing stakeholder map (collapsible)
3. **Open Commitments** — what we owe them (already computed in Actions)
4. **Risks** — existing risk register
5. **Win Strategy** — #1 closer, power move, landmines (already exists)
6. **Buying Committee** — DM, champion, blockers (already exists)
7. **Similar Won Deals** — moved here from left column (already computed)
8. **Deal Narrative** — moved here from left column

All cards are collapsible (`Collapsible`), default-open if non-empty. Each uses the existing monochrome bg-secondary styling — no rainbow colors.

## Left rail — restructured Identity + Key Info

Current left column has too much (vitals, contact, dates, narrative, similar won, etc.). Reorganize into clear logical groups matching HubSpot's "About this contact" pattern:

1. **Identity** (top) — Avatar, Name, Title, Company (linked pill), Brand badge
2. **Key Information** — Stage, Priority, Forecast, ICP Fit, Owner, Service, Deal Value, Subscription Value
3. **Email Activity** — `<EmailMetricsCard>` (already built but never mounted into the layout)
4. **Engagement** — Days in stage · Last contact · Next follow-up · # of submissions · # of meetings
5. **M&A Criteria** *(SourceCo only)* — Target criteria, Target revenue, Geography, Acquisition strategy, Buyer type
6. **Dates & Contract** — Submitted, Closed, Contract start/end, Billing freq

## Activity timeline — the heart of the rebuild

Currently the Timeline tab only shows `lead_activity_log` (stage changes + manual events). Rebuild as a true unified timeline by merging:

- Stage changes (from `lead_activity_log`)
- Meetings (from `lead.meetings`) with prep/recording links
- Emails sent/received (from `lead_emails`)
- Calendly bookings (from `calendly_booked_at`)
- Form submissions (from `lead.submissions`)
- Notes added
- Tasks completed

Group by month (`April 2026`, `March 2026`). Filter chips at top.
Same compact row pattern HubSpot uses: icon · type label · timestamp · summary · expandable detail.

## What I'm NOT changing
- `LeadContext` and all data plumbing — untouched
- `MeetingsSection`, `DealIntelligencePanel`, `EmailsSection`, `EmailMetricsCard` — reused as-is
- Action queue logic — verbatim
- Any edge functions, DB schemas, or types

## Files touched
- `src/pages/DealRoom.tsx` — major rewrite (single file)
- `src/components/dealroom/IdentityCard.tsx` — new (extract for cleanliness)
- `src/components/dealroom/KeyInformationCard.tsx` — new
- `src/components/dealroom/QuickActionBar.tsx` — new
- `src/components/dealroom/UnifiedTimeline.tsx` — new
- `src/components/dealroom/RightRailCards.tsx` — new (wraps existing intelligence)
- `src/components/dealroom/CollapsibleCard.tsx` — new (shared shell)

## Design integrity guarantees
- Hyper-minimalist, monochrome — no traffic-light colors except existing health/risk severity badges
- Lucide icons only, no emojis
- Tailwind tokens (bg-secondary, border-border, text-muted-foreground)
- Same density and font scale as today
- Keyboard nav preserved (prev/next deals, Cmd+K)

