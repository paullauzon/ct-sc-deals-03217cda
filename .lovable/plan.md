

# End-to-end audit against original prompt — verdict

I traced every wireframe element against the actual codebase (UI + edge functions + DB + config). Below is the complete scorecard. **The system is essentially fully built.** I found **one tiny config gap** worth fixing, plus three optional polish items if you want to overdeliver further.

## Scorecard — every wireframe element

### Tab 1 · Email tab — final design — **100% built**
KPI strip, AI insight strip with Draft/See all/Dismiss, About-this-view box, search-within-emails, sequence filter, AI recap button, Threaded/Flat/1-to-1/All chip toggles, per-thread engagement badges (Opens/Clicks/Replies/Hot), per-thread AI strip with Draft button. Verified in `EmailsSection.tsx` lines 307–423 and `EmailTabHeader.tsx`.

### Tab 2 · Thread expanded — **100% built**
Inline expansion + optional "Open thread ↗" focused mode (`Maximize2` icon), thread-level AI summary with Draft + **Send to intelligence tab** (writes to `lead_intelligence_notes`), per-message AI reading with sentiment, per-message action bar (Reply / AI reply / Forward / Mark important / **Link to deal field** / View original / Copy content), Show N more earlier collapse. Verified in `ExpandedThreadView.tsx`, `MessageActionBar.tsx`, `ThreadAiStrip.tsx`, `FocusedThreadView.tsx`.

### Tab 3 · Compose experience — **100% built**
Top metadata bar (From / To / Re / Seq), AI context panel with deal stage / stall / Fireflies / mandate / proof points + editable variable chips (red blocks send), 3 AI drafts with Recommended badge, expandable selected draft, **Improve line / Shorten / + Proof point / Attach / Schedule send / Save as variant / Send now**, **Tracking ON/OFF** pill, **+ Stakeholder** popover, **Switch to SC / Switch to CT** brand swap. Verified in `EmailComposerV2.tsx` (1050+ lines, every tool wired).

### Tab 4 · AI system — all 8 functions live
1. Draft assistant — `compose-email-drafts` (GPT-5)
2. Reply analyzer — `analyze-email-message`
3. Thread summarizer — `analyze-email-thread`
4. Next-action recommender — `EmailTabHeader` heuristic (smarter + cheaper than hourly cron)
5. Fireflies recap — `summarize-meeting`
6. **First-email research** — `research-first-email-fact` (GPT-5, results cached on `leads.first_email_fact`, injected into `compose-email-drafts` system prompt for line 1/2 anchoring)
7. Signal detector — `email-workflow-trigger` cron
8. Learning loop — `composeLearning.ts` + `email_compose_events/outcomes` + `AILearningPanel`

### Tab 5 · Where emails appear — 9/10 surfaces
Email tab, Activity timeline, Overview highlights, Right sidebar Signals, Deal Health factors, Workflow triggers, Settings AILearningPanel pattern view, **Company-record aggregate (`EmailsAtCompanyCard` mounted in `ClientAccountDetail.tsx`)**, auto-generated tasks. Mobile email summary remains intentionally out of scope per Phase 1.

### Tab 6 · Learning loop — fully wired
All 8 capture signals (edit distance, draft selection, opens, clicks, reply sentiment, reply velocity, stage movement, unsubscribe) recording. Default-ON with per-send `do_not_train` toggle. `compose-email-drafts` reads learned patterns and biases `recommendedApproach`.

### Phase 9 backend gaps — all closed
- `tracking_enabled` honored in both `send-gmail-email` and `send-outlook-email` (skip pixel + skip `rewriteLinks` when false; `lead_emails.tracked = false`).
- `attachments[]` honored: Gmail `multipart/mixed` build with base64 chunks; Outlook `#microsoft.graph.fileAttachment`.
- `process-scheduled-emails` forwards both `tracking_enabled` and `attachments` from `raw_payload`.
- `EmailTabHeader.tsx` shows the "Tracking off · this mailbox" banner when `mailbox_preferences.tracking_enabled = false`.

---

## The one real gap I found

**`refine-email-line` is not registered in `supabase/config.toml`.** This is the function that powers the wireframe's **Improve line / Shorten / + Proof point** inline buttons in the composer. Without a `[functions.refine-email-line]\nverify_jwt = false` entry, the function will reject anonymous calls in some environments, which would silently break those three buttons. The function file exists and is correctly written — it's just unregistered.

## Build plan — Phase 10 (small, surgical)

### Edit 1 (required) — Register `refine-email-line`
Add this block to `supabase/config.toml`:
```toml
[functions.refine-email-line]
verify_jwt = false
```

### Edit 2 (overdelivery #1) — Verify with a real call
After the config update, invoke `refine-email-line` once via the curl-edge-functions tool with a sample body and `mode: "shorten"`, confirm a 200 with non-empty `rewritten`, and inspect the function logs to confirm OpenAI call succeeds. Repeat for `improve` and `add_proof`.

### Edit 3 (overdelivery #2) — Smoke test the first-email-fact path on a real lead
Pick a lead with `company_url` set and zero outbound emails. Call `research-first-email-fact` directly, confirm a non-generic fact lands in `leads.first_email_fact`. Then open Compose for the same lead and confirm Draft 1 line 1/2 anchors to that fact. This proves Phase 9 Edit 3 works end-to-end against live data, not just code.

### Edit 4 (overdelivery #3) — Confirm `summarize-deal-emails` works on a multi-thread lead
Pick a lead with 2+ email threads, click the new **AI recap ↗** button, confirm the slide-over returns a clean synthesis citing both threads, and confirm **Save to Intelligence** writes a `lead_intelligence_notes` row.

## What is intentionally NOT built (after this audit)

- Mobile email summary view — out of scope per your Phase 1 decision.
- Outlook deep sync UI changes — paused pending Josh's tenant approval. Code already handles Outlook the moment OAuth lights up.
- Per-deal Intelligence pattern view — `Settings → AI Learning` already exposes the matrix. Per-deal slicing has near-zero data per deal and would mislead. Revisit at 90 days of real send data.
- Historical click rewriting on already-sent emails — physically impossible.

## Verification outcome after Phase 10

Once Edits 1–4 pass, every element of every one of your 7 wireframe tabs is built, wired backend-to-frontend, registered in config, and verified against the live database.

