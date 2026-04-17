

## Audit — 150 active leads (CT 76 + SC 74), excluding Lost/Revisit/Went Dark/Closed Won

### Coverage matrix (no movement vs last session — confirms no new code shipped between)

| Field | CT (76) | SC (74) | Status |
|---|---|---|---|
| buyer_type | 57 (75%) | 53 (72%) | OK |
| target_criteria | 47 (62%) | 50 (68%) | Clean |
| authority_confirmed | 28 (37%) | 15 (20%) | Transcript promote landed |
| decision_blocker | 29 (38%) | 17 (23%) | Transcript promote landed |
| **deal_narrative** | **29 (38%)** | **17 (23%)** | **Backfill landed last session ✓** |
| **firm_aum / deal_type / txn_type** | **0 / 0 / 0** | **0 / 0 / 0** | **AI-tier never run (6th session)** |
| has enrichment JSON | 0 | 1 | Confirms zero AI runs |

### Stage-level health

| Stage | Total | Assigned | Has follow-up | w/ meetings | w/ intel |
|---|---|---|---|---|---|
| New Lead | 90 | 0 | 1 | 2 | 1 |
| Meeting Set | 11 | 11 | — | 4 | 2 |
| Meeting Held | 44 | 34 | — | 43 | 39 |
| Proposal Sent | 4 | 3 | — | 4 | 4 |
| Qualified | 1 | 1 | — | 0 | 0 |

### Five findings (ranked by addressable lift)

**Finding 1 — New Lead bucket is dying.** 90 leads, 85 older than 7 days, 0 assigned, 0 prescreened, 1 has follow-up date, only 2 have meetings booked. **This is the biggest leak.** 90 × $X potential walking out the door because nobody owns them. Tiers ARE assigned (6 tier-1, 26 tier-3) — so scoring works, just no human action follows. **Fix:** auto-assign New Leads to the round-robin owner on ingestion AND set `next_follow_up = created_at + 1 business day` if empty. Already partially wired in `ingest-lead` for some sources — needs to cover all.

**Finding 2 — Service Interest = TBD on 32 of 44 Meeting Held leads (73%).** Reps held the meeting but didn't capture which service the prospect wants. Synthesized `deal_intelligence` JSON does NOT contain a `serviceInterest` key (verified across 14 keys for CT-071). **Fix:** add a `serviceInterest` field to the `synthesize-deal-intelligence` extraction prompt + promote it to the column when empty. ~32 leads benefit, the data is in transcripts.

**Finding 3 — Late-stage governance gap (48 leads, 4 fields each = 192 cells).** `next_mutual_step`, `forecasted_close_date`, `close_confidence`, `forecast_category` all 0% across Meeting Held + Proposal Sent. Confirmed last session these aren't in JSON and aren't reliably extractable. **Fix:** ship the "Forecast" inline-edit row I planned 2 sessions ago — a 4-field strip in the lead panel right rail that appears for stage ≥ Meeting Held, with empty-state nudges. Manual rep entry but with a forcing surface.

**Finding 4 — AI-tier STILL 0% (6th session).** 149 leads × 3 fields = 447 empty cells. The "Fill all AI gaps in batches" button has been wired since session 1. **No code change** — but I'll add a **persistent yellow banner at the top of the Pipeline page** that says "447 enrichment cells empty — click to fill (~8 min, ~$3)" so the prompt can't be ignored. Self-dismissing once `enrichment IS NOT NULL` count > 100.

**Finding 5 — Stale-transcript backlog (8 leads): structural, NOT addressable in current path.** All 8 show `transcript_len = NULL` — Fireflies stored summary + nextSteps but no raw transcript. Need a separate "re-fetch transcript from Fireflies API by ID" path. CT-051, CT-036, CT-044, CT-078, SC-I-039, SC-T-006, SC-T-024, SC-T-026. **Out of scope for this session** — flag for a dedicated Fireflies re-fetch effort.

### Plan

**Step 1 — Auto-assign + auto-schedule New Leads** (`ingest-lead` + one-off backfill).
- Modify `ingest-lead` to set `assigned_to = 'Malik'` (current default per Calendly memory) and `next_follow_up = created_at + 1 business day` when empty.
- One-off SQL backfill the 90 existing New Leads.
- Expected lift: 90 leads enter active outreach queue.

**Step 2 — Add `serviceInterest` to deal-intelligence synthesizer + promotion mapping.**
- Update `synthesize-deal-intelligence/index.ts` prompt to extract `serviceInterest` (one of: "Off-Market Email Origination", "Direct Calling", "Banker/Broker Outreach", "Targeted Buyer Search", or `null`).
- Update `bulk-process-stale-meetings` & `bulk-promote-transcript-fields` to map `deal_intelligence.serviceInterest` → `service_interest` column when empty.
- Re-run synthesis for the 39 Meeting-Held leads with intel but no service.

**Step 3 — Persistent enrichment banner on Pipeline.**
- Yellow strip in `Pipeline.tsx` header when `enrichment IS NULL` count > 50. One-click runs the batched job; auto-dismisses below threshold.

**Step 4 — Forecast inline-edit row in lead panel right rail (stage ≥ Meeting Held).**
- New `ForecastRow` card in `LeadPanelRightRail.tsx` with 4 inline-edit fields: `next_mutual_step`, `forecasted_close_date` (date), `close_confidence` (1–5 select), `forecast_category` (Commit/Best Case/Pipeline/Omitted).
- Empty-state copy: "Forecast not set — needed for pipeline reporting".

**Step 5 — Update audit baseline.**

### Files touched
- `supabase/functions/ingest-lead/index.ts` — auto-assign + auto-schedule
- `supabase/functions/synthesize-deal-intelligence/index.ts` — extract `serviceInterest`
- `supabase/functions/bulk-promote-transcript-fields/index.ts` — map `serviceInterest`
- `supabase/functions/bulk-process-stale-meetings/index.ts` — map `serviceInterest`
- `src/components/Pipeline.tsx` — enrichment nudge banner
- `src/components/lead-panel/LeadPanelRightRail.tsx` — Forecast card
- `src/components/lead-panel/cards/ForecastCard.tsx` — NEW
- One-off SQL: assign + follow-up backfill for 90 New Leads
- `.lovable/audit/coverage-2026-04-17.md` — append

### Trade-offs
- **Win:** 90 New Leads enter active queue (biggest lift). 39 Meeting-Held leads get serviceInterest filled. 48 leads get a forcing surface for forecast data. AI-tier banner can't be ignored anymore.
- **Cost:** ~$0 for synthesizer re-run on 39 leads (incremental, no transcript refetch). ~$3 for AI-tier batch when user finally clicks. Code: 1 new card, 4 function edits, 1 banner.
- **Risk:** Auto-assigning to "Malik" hardcodes ownership — acceptable per current Calendly default. Forecast card is additive; no existing UI changes.
- **Loss:** None.

### Verification
1. SQL: New Lead assigned count rises 0 → 90.
2. SQL: Service Interest <> 'TBD' on Meeting Held rises 12 → 35+.
3. Open CT-026 (Eric Lin, Meeting Held) → Forecast card appears in right rail with 4 empty inline fields.
4. AI-tier banner shows on Pipeline header until user runs batch.
5. Stale-transcript 8 leads — flagged structural, no change expected.

