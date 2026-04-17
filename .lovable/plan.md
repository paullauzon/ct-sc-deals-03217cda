

## Audit findings — 150 active leads (CT 76 + SC 74)

### Coverage matrix vs. last session

| Field | CT (76) | SC (74) | Δ vs prior | Status |
|---|---|---|---|---|
| target_criteria | 47 (62%) | 50 (68%) | unchanged | Clean — only legitimate rows remain |
| authority_confirmed | 28 (37%) | 15 (20%) | unchanged | Transcript promote landed |
| decision_blocker | 29 (38%) | 17 (23%) | unchanged | Transcript promote landed |
| **firm_aum / deal_type / txn_type** | **0 / 0 / 0** | **0 / 0 / 0** | **UNCHANGED** | **AI-tier never run** |
| has enrichment JSON | 0 | 1 | unchanged | Confirms zero AI runs |
| has deal_intelligence | 29 | 17 | unchanged | 46 leads with rich intel |
| **next_mutual_step** | **0** | **0** | — | **NEW gap — never populated** |
| **forecasted_close_date** | **0** | **0** | — | **NEW gap** |
| **deal_narrative** | **0** | **0** | — | **NEW gap (DB column empty, but JSON has it!)** |
| **close_confidence** | **0** | **0** | — | **NEW gap** |

### Stage-by-stage health

| Stage | Total | w/ meetings | w/ deal_intel | Missing intel |
|---|---|---|---|---|
| New Lead | 90 | 2 | 1 | 1 |
| Meeting Set | 11 | 4 | 2 | 2 |
| Meeting Held | 44 | 43 | 39 | **5** |
| Proposal Sent | 4 | 4 | 4 | 0 |
| Qualified | 1 | 0 | 0 | 0 |

### Three findings

**Finding 1 — `dealNarrative` exists in JSON for 46 leads but the manual `deal_narrative` column is 0% populated.**
This is the same pattern we fixed last session for `authority_confirmed` / `decision_blocker`. The synthesizer writes a rich paragraph into `deal_intelligence.dealNarrative` (string, ~200+ chars), but `bulk-promote-transcript-fields` doesn't map it to the `deal_narrative` column. **Free win — just add the mapping.** Expected lift: 46 leads gain a rich deal narrative.

**Finding 2 — Late-stage deal-mgmt fields (`next_mutual_step`, `forecasted_close_date`, `close_confidence`) are 0% across 48 Meeting Held / Proposal Sent leads.**
Inspected `deal_intelligence` keys for 3 sample leads — these fields **don't exist** in the JSON. They'd need to be either:
- (a) added to `synthesize-deal-intelligence` extraction prompt + then promoted, OR
- (b) populated manually by reps (this is what most CRMs do for forecasting)
These are forecasting/governance fields, not enrichment fields. **Recommend (b) — leave for manual entry.** They aren't reliably extractable from a single discovery call. Adding a "Forecast" inline-edit row to the lead panel for late-stage deals would give reps the right surface — but that's a UI feature, not a data backfill.

**Finding 3 — AI-tier STILL 0% across 149 of 150 leads. Same blocker as past 4 sessions.**
The "Fill all AI gaps in batches" dropdown remains unclicked. 596-cell gap, ~8 min user time, ~$3 OpenAI. **No code change needed — just the click.**

**Finding 4 — 8 stale-transcript leads cannot be processed via current path.**
Confirmed via JSON inspection: all 8 have `meetings[].transcript_len` of 0 (or absent). They have summaries + nextSteps from Fireflies but no raw transcript text was ever stored. Our `bulk-process-stale-meetings` correctly requires `transcript_len > 200` so it skips them. **This is structural.** To unblock would require a separate "re-fetch transcript from Fireflies API" path — out of scope for this audit, distinct issue.

### Plan

**Step 1 — Add `dealNarrative` → `deal_narrative` mapping to `bulk-promote-transcript-fields`** (the actual fix).
One-line addition: when `deal_intelligence.dealNarrative` is a non-empty string and `deal_narrative` column is empty, write it. Re-run promotion. Expected: 46 leads gain rich narratives, instantly visible in Deal Room.

**Step 2 — User runs the AI batched enrichment** (5th time documenting this — the button is wired and waiting).
Pipeline → "Fill SourceCo Dossiers" → "Fill all AI gaps in batches".

**Step 3 — Update audit baseline** at `.lovable/audit/coverage-2026-04-17.md` with today's findings: dealNarrative gap identified, late-stage deal-mgmt fields confirmed as manual-only, stale-transcript backlog confirmed structural.

### Files touched
- `supabase/functions/bulk-promote-transcript-fields/index.ts` — add 1 mapping for `deal_narrative`
- `.lovable/audit/coverage-2026-04-17.md` — append
- One execution of the function after deploy (auto-promotes the 46 narratives)

### Trade-offs
- **Win:** 46 leads gain rich, multi-paragraph deal narratives in their Deal Room (currently blank). Free, deterministic, instant.
- **Cost:** ~5 lines of code.
- **Risk:** None — `dealNarrative` is already validated as a string by the synthesizer.
- **Loss:** None.

### Verification
1. SQL: `SELECT COUNT(*) FROM leads WHERE deal_narrative <> '' AND archived_at IS NULL` rises from 0 → 46.
2. Open CT-071 (Piyush Gupta) → Deal Room shows the 200+ char narrative we previewed.
3. AI-tier remains 0% until user clicks the dropdown — separate user action.

