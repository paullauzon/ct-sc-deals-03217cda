

# Activities tab — what's still missing

I audited the current `UnifiedTimeline.tsx` against the mockup and against your direction to "think with AI rationalization and call transcripts in mind." Here's what's done, what's open, and what to build next.

## ✅ Already shipped from the original plan

| Item | Status |
|---|---|
| Tasks in timeline + Tasks filter pill | ✅ Lines 197-207, 246-263 |
| Calls as first-class events (`call_logged`) | ✅ `LogCallDialog` writes it; Calls filter renders Phone icon |
| Dismissable intro banner | ✅ `LeadActivityTab.tsx` `ActivityTabIntro` |
| Default-expand recent 10 | ✅ `defaultOpenIds` Set passed into `TimelineRow` |
| SLA / playbook pills + stall reason on task rows | ✅ Lines 636-657 |
| Filter pill reorder to match mockup | ✅ All · Emails · Calls · Notes · Meetings · Tasks · Stage · Logged · Pinned |

## ❌ Still open — three meaningful gaps

### Gap A — Meeting rows don't surface AI rationalization (transcript intelligence)

This is the biggest miss given your prompt. Right now a meeting row shows only `intel.summary` as the expanded body and "N attendees" as meta. We have a full `MeetingIntelligence` object on every processed meeting — and it's invisible in the timeline.

Available but unused per row: `engagementLevel`, `buyerJourney`, `internalChampionStrength`, `talkRatio`, `questionQuality`, `objectionHandling`, `decisions[]`, `actionItems[]`, `nextSteps[]`, `painPoints[]`, `competitiveIntel`, `pricingDiscussion`, `nextMeetingRecommendation`.

**What to add to the expanded meeting row:**
- A pill row mirroring the email enrichment row: `Engagement: Highly Engaged` · `Buyer journey: Evaluating` · `Champion: Strong` · `Talk ratio 38%` · `Questions: Strong`
- A compact "AI extracted" block below the summary with three sections (collapsed by default, max 3 items each):
  - **Decisions made** — bullets from `intelligence.decisions`
  - **Action items** — bullets from `intelligence.actionItems` with owner + status pill
  - **Next meeting recommendation** — single-line hint when present
- An "Open transcript" link next to "Open recording →" that opens the existing `TranscriptDrawer` (already in the codebase per `dialogs/TranscriptDrawer.tsx`)
- A subtle `AI` chip on the meeting row icon area when `intelligence` is populated, matching the email `AI-drafted` style

This turns the timeline from a list of dates into a scannable record of *what was decided and why*, which is what "complete relationship history" actually means.

### Gap B — Call rows don't surface AI rationalization either

Calls today log only a single concatenated string ("Call logged: Connected · 12m · summary"). For symmetry with meetings (and to match the mockup's intent), call rows should:
- Parse outcome / duration / summary back out and render them as discrete pills (`Connected`, `12 min`)
- When `summary` is non-trivial (>40 chars), run the same AI extraction we use for meeting transcripts to pull `actionItems`, `decisions`, `nextStep` — store on a new `lead_activity_log.metadata jsonb` field at log time so it renders on every revisit without re-running AI
- Render the extracted intelligence in the expanded body identically to meetings (same pills + sections), so users get one consistent "what happened" view across calls and meetings

This is the "AI rationalization for call transcripts" the prompt asked about — currently the call summary is dead text.

### Gap C — `sequence_paused` activity row on inbound replies (Gap 4 from original plan)

The infrastructure is already there: `sync-gmail-emails/index.ts` lines 522-540 and `sync-outlook-emails/index.ts` lines 236-276 detect the inbound reply and stamp `replied_at`. The mockup wants an additional row right under the inbound email: `[S5 paused on reply]`.

**What to add** — in both sync functions, after stamping `replied_at`, if the matched outbound carried a `sequence_step`, insert one extra `lead_activity_log` row:
```
event_type: "sequence_paused"
description: "Sequence ${step} auto-paused on reply"
new_value: step  (e.g. "S5-A")
```
Then in `UnifiedTimeline`, render `sequence_paused` events with a distinct amber-monochrome pill on their own row directly under the inbound email row.

This closes the last item from the original mockup spec.

## Build order (recommended)

| # | Item | Files | Effort |
|---|---|---|---|
| 1 | **Meeting AI rationalization in expanded rows** (Gap A) | `UnifiedTimeline.tsx` — add `MeetingIntelBlock` component reading `event.meta = intel`, "Open transcript" link wired to existing `TranscriptDrawer` | M |
| 2 | **Call AI rationalization** (Gap B) — new `lead_activity_log.metadata jsonb` column via migration; `LogCallDialog` calls a small `extract-call-intel` edge function (GPT-4o-mini, single shot) and writes `metadata`; `UnifiedTimeline` renders it identically to meetings | DB migration + new edge function + `LogCallDialog.tsx` + `UnifiedTimeline.tsx` | M-L |
| 3 | **Sequence-paused-on-reply row** (Gap C) | `sync-gmail-emails/index.ts`, `sync-outlook-emails/index.ts`, `UnifiedTimeline.tsx` rendering | S |

## What the user gets

After all three: the Activities tab becomes a true **intelligence-rich relationship history**. Every meeting and every call shows what was decided, what's owed, who the champion is, and how engaged the buyer is — extracted by AI from the actual transcript, not just a date and a summary line. Inbound replies cleanly show "S5 paused on reply" right under the trigger, matching the mockup verbatim. Tasks, emails, notes, stage events, and submissions all stay where they are.

## Out of scope

- Re-extracting historical call summaries — only new calls get AI rationalization unless you want a one-time backfill (separate ask)
- Letting users edit AI-extracted bullets inline — read-only for v1
- A separate "AI insights" filter pill — meetings/calls already filter via `Meetings` and `Calls`

