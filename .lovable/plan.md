

## v6 status — all 5 items shipped & wired

Verified end-to-end against the codebase. No gaps.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Inline "Ask about this deal" AI chat | ✅ Live | `AskDealDrawer.tsx` mounted in `LeadDetailPanel.tsx:416`, edge function `ask-deal` registered in `config.toml:60` |
| 2 | Daily AI standup digest card | ✅ Live | `DailyStandupCard` imported in `Dashboard.tsx:11` and rendered at top of Overview tab (`:462`), edge function `daily-standup` deployed |
| 3 | Win probability + slip risk in header | ✅ Live | `dealPredictions.ts` has both functions, header chips render in `LeadPanelHeader.tsx` |
| 4 | Stalled-deal early warning chip on Pipeline | ✅ Live | `Pipeline.tsx:28` imports `isEarlyStallWarning` + `computeSlipRisk`; chip renders at `:496-498` for watch / at-risk / critical bands |
| 5a | Post-call coach card | ✅ Live | `MeetingCoachCard.tsx` exists, `meetingCoach.ts` has `deriveCoachingInsights`, mounted inline per meeting in `MeetingsSection.tsx:885` |
| 5b | Email objection responder | ✅ Live | `detectEmailObjections` in `meetingCoach.ts:179`, "Suggest 3 responses" button in `EmailsSection.tsx:350`, edge function `suggest-email-responses` deployed and registered in `config.toml:66` |

## Verification steps (browser)

1. **Standup card** — open Dashboard → Overview tab → top row should show Daily AI Standup
2. **Pipeline slip chip** — open Pipeline → look for amber "Slip risk" chip on stalling deals
3. **Win prob / slip in header** — open any active deal → header should show win % and slip-risk chips with factor tooltips
4. **Ask AI** — click "Ask AI" in lead panel header → drawer opens, suggested prompts work, streaming response renders token-by-token
5. **Meeting coach** — open a deal with a processed meeting → Meetings tab → "Coach" collapsible above the summary
6. **Email objection responder** — open Emails tab → on an inbound email containing pricing/timing/competitor language, "Suggest 3 responses" button appears → click → 3 drafts render

## What's deferred (acknowledged, separate v7+ rounds)

- Forecast confidence calibration card (theme 1)
- Theme 3 — cross-book conversation analytics dashboard
- Theme 4 — M&A buybox match scoring
- Theme 5 — post-close / client success / renewal pipeline
- Theme 6 — multi-step email cadence engine
- Theme 7 — saved views, bulk actions, source ROI, data quality dashboard

## Recommendation

v6 is complete. Nothing left to build in this round. If you want to start v7, the highest-leverage next themes (in priority order) are:

1. **Cross-book conversation analytics** (theme 3) — pure aggregation over data we already extract per meeting; biggest insight-per-build-hour ratio of anything remaining
2. **Post-close / renewal pipeline** (theme 5) — biggest entire gap in the product
3. **M&A buybox match scoring** (theme 4) — most uniquely differentiating vs HubSpot/Salesforce

