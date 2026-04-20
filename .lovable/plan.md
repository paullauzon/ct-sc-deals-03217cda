

## Polish the right rail to match the expanded wireframe screenshots

The structure is right. What's missing is the **detail and polish** inside each card. Five focused upgrades.

### 1. Deal Health — show factor breakdown + progress bar
`computeDealHealthScore` already returns a `factors[]` array (e.g. "Champion identified +20", "Stalling -15"). The card hides it. Add:
- A green→gray gradient bar under the score (like wireframe).
- Render `factors` as a list with the impact value right-aligned and color-coded (emerald for positive, red for negative).
- Keep momentum + sentiment lines below the divider as today.

File: `src/components/dealroom/RightRailCards.tsx`

### 2. Signals — switch from alert chips to dot+title+subtitle list
Wireframe is a clean info list, not a warning panel.
- Extend `getDealSignals` in `shared.tsx` to return `{ severity, title, description }` (description optional). Today it returns `{ severity, message }` only — derive title from existing message and add a one-line description per signal type (e.g. for "stage stale" → "No activity logged in Xd since proposal. Auto-task was created but not completed.").
- Rewrite `SignalsCard` to render a simple list: a colored dot (amber=warning, emerald=positive, red=critical), bold title, muted description. Drop the boxed alert styling.
- Backwards-compat: `LeadActivityTab` consumers of `getDealSignals` still get `message` (alias to `title`).

Files: `src/components/lead-panel/shared.tsx`, `src/components/lead-panel/cards/SignalsCard.tsx`

### 3. Open Tasks — show assignee, priority, and "auto-created" badge
- Surface `task.task_type` as the auto-created hint (any task with a non-empty `playbook` field is auto-created — show small `auto-created` chip).
- Show "Assigned to {lead.assignedTo} · {priority}" subtitle. Priority comes from a heuristic: tasks tied to overdue follow-ups or close-won SLA = "High priority", otherwise "Normal".
- Move the date to the right side in red/amber when overdue, neutral otherwise (matches wireframe's red "Apr 26" / "Apr 24").

File: `src/components/lead-panel/cards/OpenTasksCard.tsx`

### 4. Stakeholders — add smart coaching callout
Add an info banner at the top of the card that adapts to coverage:
- 0 stakeholders → "No stakeholders mapped. Add the people involved in this deal to multi-thread."
- 1 → "Single-threaded. Identify a second contact before the next milestone."
- ≥2 with no champion → "{N} stakeholders, no champion confirmed. Push for explicit advocacy."
- ≥2 with champion → "Stakeholder count confirmed: {N}. {champion name} flagged as champion."
Uses existing `getStakeholderCoverage` + the local `items` state. Also add small initial-avatar circles next to each stakeholder name (currently absent — wireframe shows "JM", "SR", "TK").

File: `src/components/lead-panel/cards/StakeholderCard.tsx`

### 5. Fireflies + Attachments — visual polish
**FirefliesRecordingsCard**: replace the generic external-link icon with an emerald **"Transcript ↗"** pill on the right; show attendees inline ("Malik + {first attendee name}") when intelligence has them; show duration when available (`m.intelligence?.durationMinutes` if present, fall back to nothing).

**AttachmentsCard**: 
- Add a colored **file-type badge** (PDF=red, CSV=emerald, DOC=blue, XLS=emerald, default=gray) using filename extension.
- Subtitle becomes "Added {date} · {uploader} · {size}" using `attachment.uploadedAt`/`uploadedBy`/`size` if present in the meeting attachment payload, else fall back to `From: {meetingTitle} · {size}`.
- Add small `+ Upload` button in the header (opens a "Coming soon" toast — the upload backend is out of scope; the button just signals the affordance per wireframe).

Files: `src/components/lead-panel/cards/FirefliesRecordingsCard.tsx`, `src/components/lead-panel/cards/AttachmentsCard.tsx`

### Trade-offs
- **Win:** Right rail visually matches the screenshots — actionable factor breakdown for Deal Health, scannable Signals list, richer task context, stakeholder coaching, branded attachments.
- **Risk:** A few fields (uploader, durationMinutes, signal descriptions) may be empty for older records — graceful fallbacks ensure no blank rows.
- **Out of scope:** Real file upload backend (button is a stub), per-task explicit priority/assignee fields (heuristic from existing data).

### Verification
1. Open any lead with `dealIntelligence` → Deal Health shows score + gradient bar + factor list with green +N / red -N values
2. Open a lead with multiple signals → Signals card shows dot+title+description list (no alert boxes)
3. Open a lead with auto-created tasks → Open Tasks shows "auto-created" chip + "Assigned to {owner}" subtitle
4. Open Stakeholders → coaching callout reflects current coverage; avatars show initials
5. Open a lead with Fireflies meetings → list shows "Transcript ↗" pill + attendees inline
6. Open a lead with PDF/CSV attachments → colored extension badges render correctly

