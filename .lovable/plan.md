

# Lead Side Panel — HubSpot-Grade Full-Screen Rebuild

## Scope clarification
This is the **side-panel modal** (`LeadDetail` in `src/components/LeadsTable.tsx`, opened from Pipeline / Leads / Dashboard / Action Queue / Intelligence Center / Business / Cmd+K) — NOT the standalone `/deal/:id` Deal Room route (that was rebuilt last turn).

Currently a 4xl-capped right-side `Sheet` with ~1500 lines of stacked sections. Will be rebuilt as a true full-screen workspace.

## What's wrong with today
- Capped at `sm:max-w-4xl` → cramped on a 1296px viewport
- Single scrolling column → lose context as you scroll
- Mixes editable forms, intelligence, meetings, emails, activity in one giant stream
- No quick actions (email, schedule, note, task)
- No unified activity timeline (only stage events)
- "External Research" / "Auto-Find Suggestions" / "AI Suggested Updates" / "Deal Health Alerts" all scream for attention at the top — too noisy
- EmailMetricsCard never surfaced here
- Can't compare deal health, stakeholders, risks at a glance

## New layout — full-bleed three-column, mirrors `/deal/:id` exactly

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ STICKY HEADER                                                            [⛶][✕] │
│ avatar · name · LinkedIn · brand · stage pill · health badge                     │
│ company · role · email/phone · "Open Deal Room ↗" link                           │
│ DEAL PROGRESS BAR (8 active stages)                                              │
│ [✉ Email] [📅 Schedule] [📝 Note] [✓ Task] [⚡ Draft AI] [⚙ Edit] [⋯ More]     │
├──────────────────┬──────────────────────────────────────┬────────────────────────┤
│ LEFT (300px)     │ CENTER (flex)                        │ RIGHT (320px)          │
│ Identity         │ TABS: Overview · Activity · Actions  │ Deal Health (score)    │
│ Key Information  │       Meetings · Emails · Intel.     │ Open Commitments       │
│ Email Activity   │       Files · Notes                  │ Stakeholders           │
│ Engagement       │ ─────────────────────────────────── │ Risks                  │
│ M&A Criteria     │ [Tab content]                        │ Win Strategy           │
│ Dates & Contract │                                      │ Buying Committee       │
│ Original Message │                                      │ Similar Won Deals      │
│ Pre-Screen       │                                      │ Company Activity       │
│                  │                                      │ Submission History     │
└──────────────────┴──────────────────────────────────────┴────────────────────────┘
```

- `Sheet` widened to `w-screen max-w-none` (true full-screen)
- Three independently-scrolling columns, sticky header
- Left/right collapsible toggles (chevron) — same UX as `/deal/:id`
- All existing intelligence reused — re-organized, not rebuilt

## Center tabs (tuned for our actual workflow)

| Tab | Purpose |
|---|---|
| **Overview** *(default)* | Above-the-fold scannable summary: Deal Health Alerts banner, AI Suggested Updates (when present), Auto-Find Suggestions, Deal Management form (stage / priority / forecast / ICP / owner / service / deal value / close date), Revenue & Contract, Meeting Management, Won/Lost details, Tracking |
| **Activity** | Unified chronological timeline merging stage changes, meetings, emails, Calendly bookings, submissions, notes (filter chips: All · Emails · Meetings · Stage · Notes · System) |
| **Actions** | Live priority queue / commitments / objections (reads existing Next Steps Engine, mirrors Deal Room Actions tab) |
| **Meetings** | Existing `MeetingsSection` — recordings, transcripts, prep briefs |
| **Emails** | Existing `EmailsSection` (Zapier-fed today, Outlook/Gmail when admin approves) |
| **Intelligence** | Existing `DealIntelligencePanel` (full deep-dive view) |
| **Files** | Drive link + meeting attachments aggregated |
| **Notes** | Existing notes textarea |

Removed (not relevant to us): playbooks, tickets, calls, subscriptions, website activity, communication subscriptions, attribution.

## Header — quick-action row

Below identity row, horizontal strip:
`[✉ Email] [📅 Schedule] [📝 Note] [✓ Task] [⚡ Draft AI] [📞 Log Call] [⚙ Enrich] [⋯ Archive/Delete]`

- **Email** → opens compose drawer (writes draft to `lead_drafts`)
- **Schedule** → Calendly link / shows next booked
- **Note** → inline appender → writes to `notes` + `lead_activity_log`
- **Task** → adds to `lead_tasks`
- **Draft AI** → triggers `draft-followup` edge function
- **Log Call** → quick form → activity log
- **Enrich** → existing Research & Recommend
- **More** → Archive (existing `ArchiveDialog`), expand-to-deal-room

## Left rail — "About this contact" pattern

Reorganized into collapsible sections (reuse `CollapsibleCard` from `src/components/dealroom/`):

1. **Identity** — Avatar, Name, Title, Company pill, Brand, LinkedIn, Email, Phone, Website, Drive link
2. **Key Information** — Stage, Priority, Forecast, ICP Fit, Owner, Service, Deal Value, Subscription, Tier, Pre-Screen status
3. **Email Activity** — `<EmailMetricsCard>` (already built, never mounted here)
4. **Engagement** — Days in stage · Last contact · Next follow-up · # meetings · # submissions · Hours-to-meeting-set
5. **M&A Criteria** *(SourceCo only)* — Target criteria, Revenue range, Geography, Acquisition strategy, Buyer type, Deals planned, Current sourcing
6. **Dates & Contract** — Submitted, Stage entered, Meeting set/date, Closed date, Contract start/end, Forecast close
7. **Original Message** — collapsed by default

## Right rail — intelligence cards (reuse `RightRailCards`)

1. **Deal Health** — score, trend, momentum, sentiment trajectory
2. **Open Commitments** — what we owe (from action item tracker)
3. **Stakeholders** — stakeholder map
4. **Risks** — unmitigated only
5. **Win Strategy** — #1 closer, power move, landmines
6. **Buying Committee** — DM, champion, blockers
7. **Similar Won Deals** — pattern matching
8. **Company Activity** — cross-synced associates from same company (existing `CompanyActivitySection`)
9. **Submission History** — multi-form submitters (existing `SubmissionHistory`)

All collapsible, default-open if non-empty.

## Activity timeline (Overview-adjacent, full Activity tab)

Build `LeadActivityTimeline` merging:
- `lead_activity_log` (stage changes, manual events)
- `lead.meetings` (Fireflies meetings + intel)
- `lead_emails` (inbound/outbound from Zapier; Outlook/Gmail later)
- `lead.calendlyBookedAt` + `calendlyEventName`
- `lead.submissions` (multiple form submissions)
- Notes added (when timestamped via `notes` updates)

Group by month. Filter chips. Compact icon · type · timestamp · summary · expand pattern.

## Key design constraints (per memory rules)
- Hyper-minimalist, monochrome — no traffic-light colors except severity badges already in use
- Lucide icons only, no emojis
- Tailwind tokens (`bg-secondary`, `border-border`, `text-muted-foreground`)
- Same density and font scale as Deal Room rebuild
- Cmd+K + prev/next preserved
- "Pending" language over alarm reds where possible

## What I'm NOT changing
- `LeadContext`, all data plumbing
- `MeetingsSection`, `EmailsSection`, `DealIntelligencePanel`, `EmailMetricsCard`
- AI enrichment / Research & Recommend logic — verbatim
- Auto-find / suggested updates logic — verbatim
- `ArchiveDialog`, save handlers, all field mutations
- Edge functions, DB schemas, types

## Files touched

**Major rewrite** (new file replacing `LeadDetail`):
- `src/components/LeadDetailPanel.tsx` — new, full-screen workspace shell
- `src/components/LeadsTable.tsx` — re-export `LeadDetail` from new file (keeps all 6 import sites working unchanged)

**New helper components** (in `src/components/lead-panel/`):
- `LeadPanelHeader.tsx` — sticky header + quick action bar
- `LeadPanelLeftRail.tsx` — Identity / Key Info / Engagement / M&A / Dates
- `LeadPanelRightRail.tsx` — intelligence cards (wraps existing logic)
- `LeadOverviewTab.tsx` — hosts Deal Health Alerts, AI Suggestions, Deal Management, Revenue & Contract, Meeting Management, Tracking, Won/Lost
- `LeadActivityTab.tsx` — unified timeline
- `LeadFilesTab.tsx` — Drive + attachments aggregator
- `LeadActionsTab.tsx` — actions queue (reads same lib used in Deal Room)

**Reused without modification:**
- `MeetingsSection`, `EmailsSection`, `EmailMetricsCard`, `DealIntelligencePanel`, `ArchiveDialog`
- `dealroom/CollapsibleCard.tsx`, `dealroom/RightRailCards.tsx` (where applicable)
- `ActivityTimeline`, `CompanyActivitySection`, `SubmissionHistory`, `EnrichmentSection` (extracted from current `LeadsTable.tsx` if needed)

**Sheet container:**
- `LeadDetailPanel` uses `<Sheet>` with `SheetContent` className overridden to `w-screen max-w-none p-0` for true full-screen

## Risk / mitigation
- 6 components import `LeadDetail` from `LeadsTable.tsx` → keep the export name and signature identical, swap internals only. Zero downstream changes.
- Existing helper components inside `LeadsTable.tsx` (EnrichmentSection, ActivityTimeline, CompanyActivitySection, SubmissionHistory, AISuggestionsPanel, DealHealthAlerts, Section, Field, SelectField, ClearableSelectField) → either extract to `src/components/lead-panel/shared/` or leave in place and import from there.

