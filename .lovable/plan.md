

# Phase 8 — Polish, surface, and complete the unfinished pieces of the original 7-tab wireframe

## End-to-end audit against your original prompt

I went tab by tab through all 7 wireframes and cross-checked every element against the implementation. **The vast majority of what you asked for is built and working.** Below is the honest scorecard: what shipped exactly, what shipped differently, what is missing, and what is worth building.

### Tab 1 · Email tab — final design
| Wireframe element | Status | Notes |
|---|---|---|
| KPI strip (Threads / Total / Sent-Received / Open Rate / Days since reply / Current sequence) | ✅ Built | `EmailTabHeader.tsx` |
| Always-on AI insight strip with Draft / See all / Dismiss | ✅ Built | Heuristic-driven (no extra AI cost). The wireframe shows a more verbose "Why this rec" rationale — ours is shorter. |
| About this view box (dismissible, hidden by default) | ✅ Built | localStorage persisted |
| Per-thread engagement badges (Opens 18 · Clicks 7 · Links: pricing×3 · Replied by Tim 3×) | ✅ Built | `ThreadEngagementBadges.tsx` |
| Hot — N opens today chip | ✅ Built | `computeThreadEngagement` |
| Per-thread inline AI strip with Draft button | ✅ Built | `ThreadAiStrip.tsx` |
| **Filter by sequence** button | ❌ Missing | Wireframe has it as a top-right control |
| **AI recap ↗** button (full-deal email recap) | ❌ Missing | Would jump to a thread-or-deal-wide AI summary view |
| **Search within emails** input | ❌ Missing | Today only Cmd+K global search exists; no in-tab search box |
| **Threaded / Flat / 1-to-1 / All-include-marketing** as labeled toggle chips | ⚠️ Partial | Logic exists but as plain ghost buttons, not the chip-style toggle row from the wireframe |

### Tab 2 · Thread expanded
| Wireframe element | Status | Notes |
|---|---|---|
| Inline expansion (no separate page) | ✅ Built | `ExpandedThreadView` inside Collapsible |
| Thread-level AI summary box with Draft stall response + Send to intelligence tab buttons | ⚠️ Partial | Summary + Draft button present. **"Send to intelligence tab"** action is missing. |
| Per-message AI reading box with sentiment | ✅ Built | `MessageAiReading.tsx` |
| Per-message action bar: Reply / AI reply / Forward / Mark important / Link to deal field | ✅ Built | `MessageActionBar.tsx` |
| **"Back to threads" header bar** with thread title, sequence badge, AI reply / Reply at top right | ❌ Missing | Today the thread expands inline beneath its row — wireframe shows a focused thread view with a back link |
| Show N more earlier messages collapse | ✅ Built | `COLLAPSE_THRESHOLD = 4`, tail of 3 |
| **View in original format / Copy content** buttons on each message | ❌ Missing | Wireframe shows them on every message footer |

### Tab 3 · Compose experience
| Wireframe element | Status | Notes |
|---|---|---|
| Top metadata bar (From / To / Re / Seq) | ✅ Built | Exact match |
| AI context panel with stage / days / stall reason / Fireflies excerpts / mandate / proof points | ✅ Built | Slightly trimmed copy compared to wireframe |
| Editable variable chips (red when missing, blocks send) | ✅ Built | `emailVariables.ts` + chip rendering |
| 3 AI drafts side-by-side with Recommended badge | ✅ Built | `compose-email-drafts` |
| Selected draft expands into editable area | ✅ Built | |
| Inline tools: Improve / Shorten / + Proof point / Attach / Schedule send / Save as variant / Send now | ⚠️ Partial | All except **Attach** (no attachment picker today) and the **Tracking: ON** label are present |
| **"Switch to SC" / sender brand swap** button in From row | ❌ Missing | Wireframe shows a quick brand-switch button |
| **"+ Stakeholder" button next to To** | ⚠️ Partial | Stakeholder chip strip exists below the metadata, but no inline + Stakeholder button on the To row itself |
| **Tracking: ON** label visible at send time | ❌ Missing | Tracking is on by default; nothing surfaces this to the user |

### Tab 4 · AI system
This is a **conceptual reference panel** in the wireframe (8 AI functions explained). Nothing in the product needs to look like this tab — what matters is whether the 8 functions exist:
1. Draft assistant — ✅ `compose-email-drafts`
2. Reply analyzer — ✅ `analyze-email-message`
3. Thread summarizer — ✅ `analyze-email-thread`
4. Next-action recommender — ✅ heuristic in `EmailTabHeader` (wireframe says "runs hourly cron"; we run on-render which is cheaper and works)
5. Fireflies recap generator (S4-A) — ✅ already in your existing `summarize-meeting`
6. Form research on first email (S1) — ⚠️ exists as `enrich-lead` + `backfill-discover` but not specifically tied to the first outbound email
7. Signal detector (engagement patterns) — ✅ `email-workflow-trigger` open-after-stall rule + `useEmailEngagementSignals`
8. Learning loop — ✅ `composeLearning.ts` + `email_compose_events/outcomes` + `AILearningPanel`

### Tab 5 · Where emails appear (cross-CRM surfaces)
| Surface | Status |
|---|---|
| Email tab — full thread view | ✅ |
| Activity tab — unified timeline | ✅ (already had this) |
| Overview tab — recent email highlights | ✅ `EmailHighlightsCard` |
| Right sidebar Signals card | ✅ `useEmailEngagementSignals` |
| Deal Health score factors | ✅ `useEmailHealthFactors` |
| Workflow triggers (reply → unenroll, 14d silence → break-up, open-after-stall) | ✅ `email-workflow-trigger` cron |
| **Intelligence tab — pattern view** (subject lines / send times / sequences / draft pick rates per firm-type) | ⚠️ Partial | We have `AILearningPanel` in Settings showing the matrix. Wireframe expects this also surfaced inside the deal's Intelligence tab as a deal-scoped view. |
| **Stakeholder/Company record — all emails to any contact** | ❌ Missing | Today email lookup is per-lead; no aggregate view at the company level |
| Auto-generated tasks from email content | ✅ `extract-email-tasks` cron |
| Mobile email summary view | ❌ Missing (you marked it out of scope, leaving as out-of-scope) |

### Tab 6 · Learning loop
Everything in this tab is **passive infrastructure** — built and recording. The visual pattern board exists in `Settings → AI Learning`. **All 8 captured signals (edit distance, draft selection, opens, clicks, reply sentiment, reply velocity, stage movement, unsubscribe) are wired** in `composeLearning.ts` + `measure-email-compose-outcomes` cron. Today the tables have 0 rows because no real sends have flowed through yet — the system will fill itself the moment Malik sends through Compose v2.

---

## What's worth building — Phase 8 scope

I am proposing **one consolidated phase** (no fragmentation) that closes the genuine gaps. Estimated 6–8 focused changes.

### Group A — Email tab top-bar gaps (small, high visibility)
1. **Search within emails** input — local client-side filter over subject / body / sender / sequence step in the existing thread list
2. **Filter by sequence** dropdown (multi-select chips of all sequence steps that appear in this lead's threads)
3. **AI recap ↗** button — opens a slide-over showing a deal-wide email recap synthesized from all `email_thread_intelligence` rows for this lead (one new edge function `summarize-deal-emails`, GPT-5)
4. Convert the existing Show / Threaded / Flat / Marketing buttons into the wireframe's labeled chip-toggle row for visual parity

### Group B — Thread expanded gaps (focused mode)
5. **"Back to threads" focused thread view** — clicking a thread can either expand inline (today) OR open into a focused view that hides the other threads and shows a top bar with `← Back to threads · Re: subject · S6 · 11 emails · [AI reply] [Reply]`. Behind a small `Open thread ↗` icon on each row so it's optional, not a regression.
6. **Per-message "View in original format" + "Copy content"** buttons — open original HTML in a new tab; copy plain text to clipboard
7. **"Send to intelligence tab"** button on the thread AI summary — pushes the thread summary into a new `lead_intelligence_notes` row scoped to the lead's Intelligence tab so a strategic snippet is preserved as a citation

### Group C — Compose v2 gaps (small surgical adds)
8. **Tracking: ON pill** in the footer next to Send now — display-only first, with a click-to-toggle that persists to a `mailbox_preferences.tracking_enabled` row
9. **+ Stakeholder button on the To row** — opens a popover that lists existing stakeholders + free-text email entry (replaces today's chip strip with a more discoverable affordance)
10. **Switch sender brand button** — when both Captarget and SourceCo mailboxes are connected, show a one-click "Switch to SC / Switch to CT" toggle in the From row
11. **Attachment picker** — small button that uploads to existing storage and renders an attachment chip; passes `attachments` array to `send-gmail-email` / `send-outlook-email` (both functions already accept it; just no UI wired)

### Group D — Cross-CRM surface gaps (one more place email matters)
12. **Company record email aggregator** — on the Client Account / Company view, add an `EmailsAtCompanyCard` that aggregates threads across all contacts at the same company domain. Critical for multi-stakeholder deals where the GP hasn't been emailed directly yet.

### Out of scope (intentionally)
- **Mobile email summary view** — you flagged this out of the original 7-phase plan. Stays out.
- **Outlook deep-sync UI changes** — paused per Josh's pending approval. The intelligence functions already work for Outlook the moment OAuth lights up.
- **Full Intelligence-tab pattern view** — the Settings AILearningPanel already exposes the matrix. Per-deal pattern slicing has near-zero data per deal and would be misleading. Revisit after 90 days of real data.
- **Historical click rewriting** — physically impossible (cannot rewrite already-sent emails). Existing limitation.

---

## Open questions before building (3)

1. **Focused thread view (#5)** — is it OK to keep the inline expansion as the default and add an **Open thread ↗** icon per row that opens the focused mode? Or do you want focused mode to *replace* inline expansion as the default?
2. **AI recap (#3)** — should the deal-wide email recap be a slide-over panel, or land as a new row on the Intelligence tab so it persists?
3. **Tracking pill (#8)** — default ON globally with per-mailbox override (recommended), or per-compose toggle that resets each session?

---

## Verification plan after build

- Smoke test #1: Send 3 dummy emails through Compose v2 → confirm `email_compose_events` rows land with non-zero edit distance.
- Smoke test #2: Open a thread with 3+ messages → confirm focused-view button works and Send to intelligence tab creates a `lead_intelligence_notes` row.
- Smoke test #3: Click AI recap → confirm new edge function returns a clean synthesis citing 2+ threads.
- Smoke test #4: Search "pricing" in the email tab → only matching threads show; clearing returns full list.
- Smoke test #5: On a company with 3 stakeholders at 1 firm, confirm the new EmailsAtCompanyCard aggregates correctly and links back to each contact.

