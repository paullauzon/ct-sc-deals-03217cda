
## v6 implementation status — 3 of 5 items shipped

The user-approved v6 cut had 5 sequenced items. Here's exact ground truth from the codebase:

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Inline "Ask about this deal" AI chat | ✅ Shipped | `AskDealDrawer.tsx` exists, wired in `LeadDetailPanel.tsx` line 416, edge function `ask-deal/index.ts` deployed in `config.toml` |
| 2 | Daily AI standup digest card | ⚠️ Built but NOT mounted | `DailyStandupCard.tsx` exists, `daily-standup/index.ts` deployed — but **zero imports** of `DailyStandupCard` anywhere. Card is dead code. |
| 3 | Rolling win probability + slip risk in header | ✅ Shipped | `dealPredictions.ts` has both functions, `LeadPanelHeader.tsx` lines 139-140 + 273-285 render the chips |
| 4 | Post-call coach card + email objection responder | ❌ Not started | No matches for `post-call coach`, `missedSignals`, `objectionResponder` anywhere |
| 5 | Stalled-deal early warning chip on Pipeline cards | ❌ Not started | `isEarlyStallWarning` exported from `dealPredictions.ts` but never imported in `Pipeline.tsx`. Pipeline only shows the old `momentumSignals.momentum` text. |

## Gap to close (the v6 finish-line)

### Fix 1 — Mount `DailyStandupCard` on the Dashboard Overview tab
One-line addition. The card already fetches, caches 4h, and links into deals. Drop it as the first row of the Overview tab in `Dashboard.tsx` so reps see it the moment they land.

### Fix 2 — Surface `isEarlyStallWarning` on Pipeline cards
Add a small "Slip risk" or "Stalling" chip next to the existing momentum label in `Pipeline.tsx` (around line 490-495 where momentum chips already render). Use the same muted amber treatment as the header so the design language stays consistent.

### Fix 3 — Post-call coach card (the v6 item that got skipped entirely)
After `process-meeting` synthesizes a transcript, surface a "Coach" panel inside the Meetings tab for that specific meeting. Pulls from existing `meeting.intelligence` fields we already extract:
- Buying signals not acknowledged (from `dealSignals.buyingIntent` + transcript spans we already mark)
- Questions not asked (compare against a curated checklist per stage)
- Objection-handling rating (from `objections` field, mark "addressed" vs "deflected")
- 1-line "what to do next" prompt

This is purely UI + a small derivation layer — no new edge function. New file: `src/components/lead-panel/MeetingCoachCard.tsx`, mounted inside `MeetingsSection.tsx` per meeting.

### Fix 4 — Email objection responder (lighter-weight than original spec)
When viewing an inbound email in the Emails tab that contains objection language (detected via simple keyword/phrase classifier from existing `objectionTracker` taxonomy), show a "Suggest 3 responses" button. Click → calls a new tiny edge function `suggest-email-responses` that returns 3 short drafts. User picks one → opens in EmailComposeDrawer pre-filled.

## Files touched

- `src/components/Dashboard.tsx` — mount `DailyStandupCard` at top of Overview tab
- `src/components/Pipeline.tsx` — render `isEarlyStallWarning` chip on cards
- `src/components/lead-panel/MeetingCoachCard.tsx` — NEW, derives coaching signals from `meeting.intelligence`
- `src/components/MeetingsSection.tsx` — mount the coach card inline per meeting
- `src/lib/meetingCoach.ts` — NEW, pure functions to derive missed signals / question gaps / objection-handling score
- `src/components/EmailsSection.tsx` — add "Suggest responses" button on objection-detected inbound emails
- `supabase/functions/suggest-email-responses/index.ts` — NEW, structured tool-call returning 3 drafts
- `supabase/config.toml` — register new function

## What's deferred (acknowledged, not in this round)

- Forecast confidence calibration card (theme 1, lower priority)
- Themes 3-7 (cross-book conversation analytics, M&A buybox, post-close success, sequencing, ops reporting) — separate v7+ rounds

## Risk

- All four fixes are additive
- No schema migrations
- No changes to existing data flow (meeting coach reads existing `intelligence` JSON only)
- Email objection responder is a new edge function but follows the proven `daily-standup` pattern with tool-calling
