

# Activities tab — mockup vs. implementation audit

I checked the live `UnifiedTimeline.tsx` (rendered under the **Activities** sub-tab via `LeadActivityTab.tsx`) against the wireframe.

## What's already implemented ✅

| Mockup requirement | Status | Where |
|---|---|---|
| Filter pills: All · Emails · Meetings · Notes · Stage · System · Pinned | ✅ | `FILTERS` line 71-79 — close to mockup's "All · Emails · Calls · Notes · Meetings · Tasks · Logged" |
| Full-text search across subject, body, notes, meta | ✅ | `search` state, line 271-273 |
| Collapse / expand all toggle | ✅ | `toggleAll` line 303-306, `ChevronsDown`/`ChevronsUp` |
| Reverse-chronological order | ✅ | line 257 sort |
| Month group headers | ✅ | `monthKey` + `groups` |
| Pin to top | ✅ | `togglePin` + dedicated Pinned section |
| Email rows with direction icons (↑E / ↓E) | ✅ | `iconFor` line 99-110 |
| Email enrichment pills: Opened, Clicked, Replied, AI-drafted, sequence step (S6-A), attachments | ✅ | line 543-577 |
| Meetings with Fireflies recording link | ✅ | `href` → "Open recording →" |
| Notes with author + body | ✅ | activity_log `note_added` events |
| Stage change events | ✅ | activity_log `stage_change` events |
| Calendly bookings | ✅ | dedicated `calendly` event |
| Form submissions | ✅ | `submission` event with brand meta |
| Date-range filter (7d / 30d / 90d / All) | ✅ | `RANGES` line 81-86 — bonus, not in mockup |

## Gaps vs. the mockup ❌

### Gap 1 — Tasks are completely missing from the timeline
The mockup's first row is `[Task upcoming] [SLA auto-created] Follow up post-GP meeting — has James heard back? (due Apr 26)`. The timeline pulls from `lead_activity_log`, `lead_emails`, `meetings`, `submissions`, and `calendly` — but **never queries `lead_tasks`**. Tasks (manual, playbook, SLA-auto-created) don't appear at all. The mockup also includes a **Tasks** filter pill which doesn't exist in the FILTERS array.

**Fix**: Query `lead_tasks` for the lead, project as `task` event type with status pills (`upcoming` / `overdue` / `done`), source pill (`manual` / `playbook` / `sla-auto-created`), due date, and assignee. Add `Tasks` to FILTERS.

### Gap 2 — Calls are completely missing
The mockup separates **Calls** as its own first-class filter (between Emails and Notes). Currently the only path to log a call is `LogCallDialog`, which writes a `note_added` row to `lead_activity_log` — so call logs are visually indistinguishable from text notes and can't be filtered separately.

**Fix**: Either (a) add a `call_logged` event_type to `lead_activity_log` and have `LogCallDialog` write that, or (b) create a `lead_calls` table. Recommend (a) — simpler, no schema change beyond an enum value. Add `Calls` filter pill with `Phone` icon.

### Gap 3 — Header intro banner missing
The mockup has a prominent intro: *"The Activities tab is the primary home of every email in the entire system. Every sequence email, every manual email, every incoming reply, every marketing email, every call, note, meeting, form submission, and stage change event appears here in reverse chronological order. This is the complete relationship history."*

**Fix**: Add a dismissable monochrome banner (same pattern as the Email tab's `EmailTabIntro`), persisted in `localStorage` as `activityTabIntroDismissed`.

### Gap 4 — "Sequence S5 auto-paused on reply" event missing
The mockup shows a system event: when an inbound reply arrives, the running sequence is auto-paused and a row appears: `[Email received · reply] [S5 paused on reply]`. Currently we render `replied_at` as a "Replied" pill on the outbound email, but there's no dedicated row showing the sequence-pause action. We don't currently log this event anywhere — `nurture-engine` and `process-scheduled-emails` may pause sequences but don't write to `lead_activity_log`.

**Fix**: When `sync-gmail-emails` / `sync-outlook-emails` / `ingest-email` detects an inbound reply that pauses an active sequence, write a `sequence_paused` activity log row. Render with a distinct pill on the inbound email's row. (Lower priority — depends on whether sequences actually exist in this codebase yet; if not, defer.)

### Gap 5 — Stall reason / SLA badges on task rows
The mockup's task row shows `Stall Reason: Internal approval pending` as an inline meta line and a colored `SLA auto-created` pill. This requires Gap 1 to be implemented first; the playbook/source field on `lead_tasks` already distinguishes `sla-*` playbooks (per `PipelineHealthV2.tsx` line 26-27).

**Fix**: When rendering task rows (Gap 1), surface `playbook` as a pill (`SLA auto-created` if `playbook LIKE 'sla-%'`, else `Auto-task` for playbook tasks, else `Manual`), and pull `lead.stallReason` into the meta line for any task on a stalled deal.

### Gap 6 — "Default: expanded for recent 10, collapsed for older" behavior
The mockup spec for "Collapse / expand all" says: *"Default: expanded for recent 10, collapsed for older."* Currently rows default to **collapsed**; only the global toggle flips them all. Minor UX gap.

**Fix**: In `TimelineRow`, add `defaultOpen={index < 10}` derived from position, used as the initial `useState` value (still overridable by the global toggle).

### Gap 7 — Filter ordering doesn't match mockup
Mockup order: `All · Emails · Calls · Notes · Meetings · Tasks · Logged activities`. Current order: `All · Emails · Meetings · Stage · Notes · System · Pinned`. The mockup also lacks "Stage" and "Pinned" as primary filters (they're secondary affordances).

**Fix**: Reorder FILTERS to match mockup. Keep `Stage` and `Pinned` but move them to the right or behind a "more" affordance to preserve mockup parity. Lowest priority — purely cosmetic.

## Recommended build (priority order)

| # | Item | Files | Effort |
|---|---|---|---|
| 1 | **Tasks in timeline + Tasks filter pill** (Gap 1) | `UnifiedTimeline.tsx` | M |
| 2 | **Calls as first-class events** (Gap 2) — new `call_logged` event_type, `LogCallDialog` writes it, render with Phone icon, add Calls filter | `LogCallDialog.tsx`, `activityLog.ts`, `UnifiedTimeline.tsx` | M |
| 3 | **Dismissable intro banner** (Gap 3) | `LeadActivityTab.tsx` (new `<ActivityTabIntro />`) | S |
| 4 | **Default-expand recent 10** (Gap 6) | `UnifiedTimeline.tsx` — pass `index` to `TimelineRow`, use as default `open` | XS |
| 5 | **SLA / playbook pills on task rows** (Gap 5) — depends on #1 | `UnifiedTimeline.tsx` | XS (additive) |
| 6 | **Sequence-paused-on-reply event** (Gap 4) | edge functions + `UnifiedTimeline.tsx` rendering | M (deferred until sequences are wired) |
| 7 | **Reorder filter pills to match mockup** (Gap 7) | `UnifiedTimeline.tsx` | XS |

## What the user gets

After items 1–5: every entry type from the mockup (tasks, calls, emails, notes, meetings, stage events, submissions, Calendly bookings) appears in one true reverse-chronological feed, each with the right pills (sequence step, AI-drafted, opens/clicks, SLA auto-created, stall reason). The Activities tab becomes the genuine "complete relationship history" the mockup promises.

## Out of scope (intentional)

- The mockup's left/middle/right column markers (`Layout map`, etc.) are mockup chrome, not part of the tab.
- The blue intro banner color: replaced with monochrome per the project's "no alarmist colors" memory rule.
- Date-range filter (7d/30d/90d): we have it, mockup doesn't show it — keep as bonus.

