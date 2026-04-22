

# Email Tab Redesign — Phased Implementation Plan

## Reality check first: what we already have vs. what the wireframes need

**Already built (infrastructure-side wins):**
- Open tracking (`track-email-open` + Google proxy filtering), click tracking (`track-email-click`), `lead_email_metrics` rollup table, `lead_emails.opens/clicks/replied_at` arrays
- `sequence_step`, `ai_drafted`, `email_type` columns + threading, scheduled send, both Gmail and Outlook send/sync
- Realtime subscriptions on `lead_emails`
- One AI function: `suggest-email-responses` (objection-based, 3 variants)
- `EmailsSection` already has thread grouping, mailbox scoping, scheduled strip, badges

**What the wireframes add (UX + 7 new AI surfaces):**
- Always-on **AI insight strip** at top with thread-level recommendation
- Per-thread AI analysis inline + per-message AI reading + sentiment tag
- Header KPI strip (Threads / Total / Sent-Received / Open Rate / Days since reply / Current sequence)
- Expanded thread view (all messages visible at once, no separate page)
- New **Compose experience**: 3 AI drafts side-by-side, editable variable chips, AI context panel, inline writing tools (Improve / Shorten / Add proof point), schedule send with optimal-time suggestion
- "Link to deal field" — attach an email sentence to a CRM field with audit trail
- **Learning loop**: capture edit distance, draft selection, sentiment, send time → improve future drafts per firm-type × sequence × stage

**Will the user be Malik?** All wireframes assume real opens/clicks/replies data flowing — that requires the Outlook OAuth fix you're waiting on Josh for. Phase 1–4 ship pure UX/AI on top of existing Gmail data; Phases 5+ assume Outlook is live.

---

## 7 phases, sequenced for risk and value

Each phase ships standalone — you can ship 1 and pause without breaking anything.

### Phase 1 — Header strip + AI insight strip (UX foundation, no AI)
**What:** New top section above the email list with the 6 KPIs from wireframe (Threads, Total, Sent/Received, Open Rate, Days Since Reply, Current Sequence) + the always-visible AI insight strip with one recommended next action and Draft / See all / Dismiss buttons. The "About this view" intro becomes hidden by default (only first visit).

**Why first:** Pure read-only frontend over data we already have. Ships value the moment Malik opens any deal. No backend changes.

**Scope:** ~1 component (`EmailTabHeader.tsx`) + refactor `EmailsSection.tsx` header. AI insight uses existing `nextStepsEngine` signals — no new edge function yet.

---

### Phase 2 — Per-thread AI analysis + thread badges (engagement signals)
**What:** Each thread row gets:
- Engagement badges: `Opens 18 · Clicks 7 · Links: pricing×3, proposal×2 · Replied by Tim 3×`
- "Hot — 5 opens today" hot-flag chip when engagement spikes
- Inline purple AI strip per thread with sentiment + recommended next email + Draft button

**Why second:** All raw data exists in `lead_emails.opens/clicks/replied_at`. Need one new edge function `analyze-email-thread` (Lovable AI Gateway, GPT-5-mini, structured output) that takes thread context and returns sentiment + recommendation + suggested next sequence step. Cached per thread, regenerated on new inbound message.

**Scope:** 1 new edge function, 1 new DB table `email_thread_intelligence` (thread_id PK, lead_id, summary, sentiment, recommended_action, suggested_sequence, generated_at), badge component, hot-flag detector hook.

---

### Phase 3 — Expanded thread view (Tab 2 of wireframes)
**What:** Click thread → expands inline (not new page). Shows:
- Top: thread-level AI summary box ("Proposal sent Apr 7. Tim engaged immediately…") + "Draft stall response" / "Send to intelligence tab" buttons
- Each message: full body, sender, sentiment tag, per-message AI reading box, inline action buttons (Reply / AI reply / Forward / Mark important / **Link to deal field**)
- "Show N more earlier messages" collapse for long threads

**Why third:** Heaviest UI work. Builds on Phase 2's intelligence table. "Link to deal field" creates an audit trail row in a new `email_field_links` table connecting an email sentence → a Lead field → with the captured quote (e.g. Tim's "2-3 weeks" → ExpectedCloseDate +21d).

**Scope:** New `ExpandedThreadView.tsx`, new `MessageActionBar.tsx`, new `LinkToDealFieldDialog.tsx`, `email_field_links` table.

---

### Phase 4 — Compose experience v2 (3 AI drafts + variables + context panel)
**What:** Replace current single-draft compose with the wireframe layout:
- Top metadata bar (From / To / Re / Seq) with auto-fill thread context and sequence dropdown
- "AI is drafting using the following context" panel: deal stage, days in stage, stall reason, Fireflies excerpts, mandate, available proof points + editable variable chips ([first_name]=Tim, [firm]=…, [ebitda]=$2-5M)
- 3 draft cards side-by-side (direct / data-led / question-led) with one labeled "Recommended" based on past pattern
- Selected draft expands to editable area
- Inline writing tools: Improve line / Shorten / + Proof point / Attach / Schedule send / Save as variant / Send now
- Variable chips turn red and block send if missing data

**Why fourth:** Highest single jump in value, but depends on context the prior phases surface. Needs new edge function `compose-email-drafts` returning 3 variants via tool-calling. Uses existing `lead.dealIntelligence` + Fireflies transcript + sequence context.

**Scope:** New `compose-email-drafts` edge function (3-variant tool call), heavy refactor of `EmailComposeDrawer.tsx` → new `EmailComposerV2.tsx`, variable resolver utility, "Save as variant" persisting to `email_templates`.

---

### Phase 5 — Schedule send intelligence + send-time learning
**What:**
- Schedule send picker shows "Tim typically opens at 8am PT — send then?" (one-click confirm) computed from per-recipient open timestamps
- "Tracking: ON" toggle visible per compose, persisted per-mailbox preference
- AI nudge if sending late: "It's 11pm in Tim's timezone — schedule for 8am?"

**Why fifth:** Needs enough Gmail data to compute open-time histograms per recipient (~30+ days of opens per address). Light: 1 utility hook reading `lead_emails.opens` per recipient + simple histogram, no new tables.

**Scope:** `useRecipientOpenPattern.ts` hook, send-time hint banner in compose drawer.

---

### Phase 6 — Learning loop (edit distance + draft preference capture)
**What:** Every compose action captures:
- Which of 3 drafts was selected (or "wrote from scratch")
- Edit distance between AI draft and final sent text
- Outcome 7 days later: was email opened? clicked? replied? did stage move?
- Patterns surface as "AI improved": "Direct draft now leads for PE-fund × Proposal stage (was: question-led)"
- Settings page **AI Learning** tab showing pattern board (firm-type × sequence × stage matrix with pick rate + edit-distance)
- Critical guardrail toggle: "Do not train on this" per compose action for sensitive emails

**Why sixth:** Pure data collection upfront — pays off after ~30 sends. Ships passively; insight surfaces after threshold.

**Scope:** New tables `email_compose_events` (event_id, lead_id, drafts_offered jsonb, draft_picked, final_text, edit_distance, sent_at, do_not_train) + `email_compose_outcomes` (joined async on outcome). `compose-email-drafts` reads aggregated patterns to bias draft order. New Settings → AI Learning view.

---

### Phase 7 — "Where emails appear" cross-CRM surfaces (Tab 6 of wireframes)
**What:** Wire the email signal into 5 places it doesn't yet feed:
1. **Overview tab** — top 3 most important recent emails (any reply, any unreplied hot email, any scheduled send today)
2. **Right sidebar Signals card** — engagement signals bullets ("Proposal opened 5× in 48h after 11-day silence")
3. **Deal Health score** — reply velocity (+5 fast reply), engagement rate (+10 if >50% open), sentiment trend (±15)
4. **Auto-generated tasks** — AI parses inbound emails for promises ("circle back in 3 weeks") → creates dated task
5. **Workflow triggers** — reply → auto-unenroll from active sequence; 14 days no reply → auto-send break-up; open after stall → notify

**Why last:** Each integration is small and read-only against now-mature email data. But each one touches a different existing component — best done after the email tab itself is bulletproof.

**Scope:** Edits to `LeadOverviewTab.tsx` (add EmailHighlightsCard), `SignalsCard.tsx` (read from `email_thread_intelligence`), `dealHealthUtils.ts` (add 3 email signals), 1 new edge function `extract-email-tasks` (cron + on-insert), 1 new edge function `email-workflow-trigger` (cron, 5-minute).

---

## What we cannot do (and what to call out to the user honestly)

- **True per-message sentiment from external mailboxes** requires the message body — for Outlook this needs the OAuth fix you're waiting on Josh for. Phase 2's per-thread analysis works on Gmail today; for Outlook accounts it'll start producing intelligence the moment OAuth lights up.
- **"Link clicked: pricing×3" granularity** depends on click rewriting being on at send time. Already implemented for new outbound. We can't retroactively rewrite historical sent emails — those threads will show clicks as 0 until new mail flows.
- **Mobile email summary view** (wireframe Tab 6, last card) — out of scope for these 7 phases. The CRM is desktop-first today; revisit if mobile becomes a goal.
- **Per-recipient open-time histogram** needs ≥10 opens per address to be meaningful. Below threshold we hide the suggestion rather than show a bad guess.

---

## Recommended sequencing if you want to ship value fast

- **Week 1:** Phase 1 + Phase 2 (visible new value, low risk, no Outlook dependency)
- **Week 2:** Phase 3 (heavy UI but huge perceived upgrade)
- **Week 3:** Phase 4 (the compose experience — the marquee feature)
- **Week 4:** Phase 5 + start collecting data for Phase 6
- **Week 5:** Phase 6 surfaces + Phase 7 cross-CRM wiring

If we hit anything unexpected mid-phase, we stop, take stock, and re-plan rather than charging through.

---

## Open questions worth deciding now (will affect Phase 4 specifically)

1. **AI provider**: Memory says "Direct OpenAI API only — never Lovable AI Gateway." Phase 2/4/6 need GPT-4o/5 with tool calling. We should use the existing direct-OpenAI pattern (matches `extract-call-intel`, `synthesize-deal-intelligence`), not Lovable AI Gateway. Confirm.
2. **"Link to deal field" scope**: which fields are linkable? My default plan: `nextMutualStep`, `nextMutualStepDate`, `forecastedCloseDate`, `dealNarrative`, `competingBankers`, `lostReasonV2`. Add or remove?
3. **Learning loop privacy**: default ON or default OFF for "train on this"? Wireframe says default ON with per-email opt-out toggle. Confirm that's your preference.

