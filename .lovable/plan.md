

# Lead panel — round-3 polish to "Fortune 500 sales leader" grade

## What screenshot 3 reveals (and what's missing)
Looking at the actual current state vs HubSpot + our specific workflow:

**Identity row (top)** — clean, but `29d in stage` lives orphaned in the corner. No company-domain link. No "back to pipeline" affordance (only a tiny X). Header expand icon goes to *new tab* — wrong; should toggle in-place.

**Quick action bar** — works, but: `Schedule` opens calendly.com (generic), `Note`/`Task` use `window.prompt()` (jarring, breaks the design language), `Log call` is also a prompt with no duration/outcome capture, `Email` jumps to tab but no compose surface. A Fortune 500 rep would never use a browser prompt.

**Activity timeline** — the `⚠ Follow-up pending 28 days` red banner alone in the activity tab is correct and well-placed. But there's **no way to act on it from there** (no "Snooze 7d", "Mark contacted today", "Draft follow-up" inline). It's a passive alarm.

**Left rail Key Information** — all there and inline-editable, but the **stage selector is a dropdown buried in a row**. HubSpot uses a *visible breadcrumb stage progressor* in the header — we already have a thin progress bar but no click-to-advance. Click should advance stage.

**Right rail "AI Insights"** — collapsed by default, "External Research" is bare. No deal narrative shortcut, no "compose follow-up" CTA from the same panel. Submission History is hidden. Email Activity card lives in the *left rail* but is collapsed and silent — should surface unread/awaiting reply count as a dot.

**Tabs** — `Meetings (0)`, `Emails`, `Intelligence`, `Files`, `Notes` all exist, but:
- No counts on Emails / Notes / Files (Meetings has count, others don't)
- No keyboard shortcuts (`a`, `m`, `e`, `i`, `f`, `n` would be HubSpot-grade)
- Cmd+K already exists but doesn't cycle leads from inside the panel

**Missing "table-stakes" Fortune 500 features:**
- **Prev/next deal arrows** in header (J/K nav like Linear/Superhuman)
- **Close on Esc** + click-outside on the sheet (Esc works; outside-click does because it's a Sheet, but no confirmation if dirty notes)
- **Copy deal link** button (right now you have to grab `/deal/:id` manually)
- **Last activity timestamp** in header ("Last contact 4d ago")
- **Email tab compose box** (we have `lead_drafts` infra + `draft-followup` edge function — surface it)
- **Meeting prep brief access** from Meetings tab when a future meeting is scheduled
- **Fireflies recording embed** inline (we have `firefliesUrl`, link only — could show inline player or transcript drawer)
- **Calendly booking visibility** beyond the header chip — no "View booking" → calendly link
- **"Send for review" / mention teammate** — defer
- **Activity row inline action chips** — the killer feature: each timeline row exposes `Reply`, `Forward`, `Open recording`, `Draft response` based on type

## What we're building (priority-ordered, all in v3)

### 1. Replace `window.prompt` with proper inline dialogs (P0, design-debt)
- **Note dialog** — small Dialog with autofocus textarea + Save/Cancel. Writes timestamped note to `lead.notes` *and* to `lead_activity_log` so it shows in timeline.
- **Task dialog** — title + due date + optional description. Inserts into `lead_tasks`.
- **Log call dialog** — duration (number), outcome (Connected / Voicemail / No answer / Bad number), summary textarea. Writes typed `lead_activity_log` row + bumps `lastContactDate`.
- **Email compose drawer** (right-side Sheet inside the panel) — to / subject / body, "Save as draft" → `lead_drafts`, "Generate with AI" → `draft-followup` edge function. Mark `lastContactDate` on save.

### 2. Header upgrades (P0, navigation polish)
- **Prev/next deal arrows** (`⌘[ / ⌘]`) cycle leads in the same context (pipeline order if launched from pipeline; otherwise leads context order)
- **Copy link** icon (`Link2`) — copies `/deal/:id` to clipboard
- **Last contact** chip next to days-in-stage: `Last contact 4d ago` (computed from `lastContactDate` or last email, whichever is newer)
- **Maximize icon** — change behavior: in `mode=sheet`, navigate to `/deal/:id` *in same tab* (not new tab); in `mode=page`, becomes a `Minimize2` that goes back
- **Stage breadcrumb is clickable** — click any earlier active-stage segment in the progress bar to advance/regress (with confirm if regressing)
- **Replace identity-row "Open in new tab" dropdown item** — replaced by the Copy link button; remove duplicate Research item (kept in right rail)

### 3. Activity tab — make alerts actionable (P0, the big "so what" gap)
- The "Follow-up pending Nd" banner gets **inline action chips**:
  - `Mark contacted today` → bumps `lastContactDate`
  - `Snooze 7d` → bumps `nextFollowUp`
  - `Draft follow-up` → opens email compose drawer pre-loaded via `draft-followup`
- Add **inline row actions** on timeline events: hover an email row → `Reply` chip; hover meeting row → `Open recording` / `Process meeting`; hover stage row → no-op.
- **Pin activity** (defer to v4 — out of scope, would need a `pinned` column on `lead_activity_log`).

### 4. Tabs — counts + keyboard shortcuts (P1)
- Add counts: `Emails (12)`, `Notes (3)`, `Files (5)` (computed: emails count from `lead_emails`, notes = lines in `lead.notes`, files = drive + recordings + attachments)
- Keyboard nav inside panel: `a` Activity, `c` Actions, `m` Meetings, `e` Emails, `i` Intelligence, `f` Files, `n` Notes. Bound only when panel is focused; doesn't conflict with Cmd+K.

### 5. Meetings tab — surface what we have but hide (P1)
- If a **future** meeting is on `meetingDate` (Calendly booked), show a sticky "Upcoming meeting" card at top with: meeting time, attendees, **`Generate prep brief`** button (we already have `generate-meeting-prep` edge function + `PrepBriefDialog`), and Calendly event link.
- For **past** meetings with a `firefliesUrl`, add an "Open recording ↗" affordance directly on the meeting card.
- Already wired: process meeting / re-process / view transcript. Confirm visible.

### 6. Right rail — surface AI Insights better (P1)
- **AI Insights card stays default-open** but adds a "Last refreshed" timestamp + "Re-run" button alongside "Research & Recommend"
- **Email Activity card** moves from left rail → right rail (it's intelligence, not key info), with a colored dot if `unanswered_replies > 0`
- **Submissions card** default-open when count ≥ 2 (signal of repeat interest)

### 7. Files tab — make it useful (P1)
- Add empty-state CTA: when no Drive folder, "Add Drive folder link" inline editor that writes to `lead.googleDriveLink`
- Aggregate counts: "5 items · 3 recordings · 2 attachments"
- Group by type with proper icons

### 8. Notes tab — proper editor (P2)
- Replace bare textarea with a **two-pane editor**: left = "Append note" (timestamped, writes to activity log), right = scrollable list of past notes parsed from `lead.notes` (split on `--- {date} ---` markers)
- Each appended note gets a leading `--- {ISO date} · {assignedTo or "—"} ---` separator so the history is auditable

### 9. What we explicitly defer (documenting only)
- Field-level audit log per change ("Stage changed by X on Y")
- Per-rep notification follow toggle
- Drag-to-reorder right-rail cards
- Pin activity to top
- Inline Fireflies *transcript* viewer (we link out for now; full embed needs a transcript drawer + GraphQL pull)
- Salesforce-style "Edit columns" customization
- Multi-select bulk actions inside the panel

## Files touched

**Modify:**
- `src/components/LeadDetailPanel.tsx` — wire new dialogs, prev/next nav, copy link, keyboard shortcuts, maximize/minimize behavior
- `src/components/lead-panel/LeadPanelHeader.tsx` — add nav arrows, copy link, last-contact chip, clickable progress, fix maximize
- `src/components/lead-panel/LeadActivityTab.tsx` — actionable banner with chips, inline row actions on timeline
- `src/components/dealroom/UnifiedTimeline.tsx` — emit row hover actions (callback prop)
- `src/components/lead-panel/LeadPanelRightRail.tsx` — move EmailMetricsCard here, AI Insights default-open polish, Submissions auto-open if ≥2
- `src/components/lead-panel/LeadPanelLeftRail.tsx` — drop EmailMetricsCard from here
- `src/components/lead-panel/LeadFilesTab.tsx` — empty-state inline editor for Drive folder, counts header

**New:**
- `src/components/lead-panel/dialogs/NoteDialog.tsx`
- `src/components/lead-panel/dialogs/TaskDialog.tsx`
- `src/components/lead-panel/dialogs/LogCallDialog.tsx`
- `src/components/lead-panel/dialogs/EmailComposeDrawer.tsx` — uses `draft-followup` edge function

## Untouched
- All 6 import sites
- `LeadContext`, edge functions, types, DB schema
- `MeetingsSection`, `EmailsSection`, `DealIntelligencePanel`, `LeadActionsTab`, `LeadDebriefTab`
- The `mode="sheet"` vs `mode="page"` architecture

## Risk
- Email compose drawer reuses existing `draft-followup` infra — already proven in Actions tab
- Keyboard shortcuts must not fire when typing in inputs — guard with `e.target` check
- Prev/next nav requires *some* lead order; use the `leads` context order as default fallback
- `window.prompt` removal is the largest behavior change — every replacement is a proper Dialog with the existing design language

