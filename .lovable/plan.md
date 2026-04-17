

## Audit findings — 150 active leads (CT 76 + SC 74)

### Coverage matrix vs. last session

| Field | CT (76) | SC (74) | Δ vs prior | Status |
|---|---|---|---|---|
| buyer_type | 57 (75%) | 53 (72%) | — | OK |
| target_criteria | 47 (62%) | 50 (68%) | ↓ 4 / ↓ 3 | Cleanup landed; 0 garbage rows remain |
| target_revenue | 18 (24%) | 22 (30%) | — | Form ceiling |
| geography | 22 (29%) | 23 (31%) | — | Form ceiling |
| ebitda | 2 (3%) | 19 (26%) | — | Form ceiling |
| acq_timeline | **0** | 50 (68%) | — | CT structural |
| competing_against | 14 (18%) | 4 (5%) | — | 100% addressable pool |
| **authority_confirmed** | **28 (37%)** | **15 (20%)** | **↑ 28 / ↑ 14** | **Transcript promote landed** |
| **decision_blocker** | **29 (38%)** | **17 (23%)** | **↑ 28 / ↑ 16** | **Transcript promote landed** |
| budget_confirmed | 5 (7%) | 5 (7%) | ↑ 4 / ↑ 5 | Real signal limit |
| stall_reason | 1 | 0 | — | Real signal limit |
| **firm_aum / deal_type / txn_type** | **0 / 0 / 0** | **0 / 0 / 0** | **— UNCHANGED** | **AI-tier never run** |
| has enrichment JSON | 0 | 1 | — | Confirms zero AI runs |
| has deal_intelligence | 29 | 17 | — | Source for promotion |

### Big win since last session
**Transcript-tier promotion landed cleanly: 98 fields auto-filled across 46 leads.** `decision_blocker` now at 100% of leads-with-intel (46/46), `authority_confirmed` at 93% (43/46). `target_criteria` cleanup verified — only 3 borderline rows left and **all 3 are legitimate** (CT-004 outbound thesis, CT-024 pump services Germany, SC-T-029 IoT add-ons). Parser is now fully clean.

### Three findings

**Finding 1 — AI-tier STILL 0% across 149 of 150 leads.** Same as every prior session. The "Fill all AI gaps in batches" dropdown remains unclicked. This is the dominant remaining gap: **447 empty cells** (149 × 3 fields). One click in the UI closes it — ~8 min, ~$3.

**Finding 2 — NEW: 8 leads have meeting transcripts but `process-meeting` never ran.** 7 of 8 have rich Fireflies transcripts (16K–34K chars) waiting to be extracted:
- CT-036 (Brandon Anderson, 33K chars) · CT-044 (Jared Curtis, 17K) · CT-078 (Blake Jackman, 32K) · SC-I-039 (Josh Klieger, 24K) · SC-T-006 (Leo Qendro, 27K) · SC-T-024 (Rish Sharma, 35K) · SC-T-026 (Greg Caso, 22K)
- CT-051 (Avery Humphries) has 4 fireflies IDs but transcript_len=0 — broken sync, separate issue

If we run `process-meeting` for these 7, expect ~21 more transcript-tier values to flow through (~3 fields/lead via Step 1's promotion).

**Finding 3 — `budget_confirmed` and `stall_reason` low coverage is a real signal limit, not a bug.** Only 22% of intel-bearing leads got `budget_confirmed`, only 2% got `stall_reason`. Reviewed `bulk-promote-transcript-fields` mappings: they correctly require explicit signals in transcripts (`buyingCommittee.budgetAuthority`, `momentumSignals.stallReason`). Transcripts simply don't usually contain these. **No action.**

### What stays structural (no fix)
- CT `acq_timeline = 0` — form lacks field
- 97 leads with no meetings — transcript fields genuinely unknowable
- `budget_confirmed` / `stall_reason` low — real signal limit

## Plan

### Step 1 — Reprocess the 7 leads with unprocessed transcripts (NEW work)
For CT-036, CT-044, CT-078, SC-I-039, SC-T-006, SC-T-024, SC-T-026 — invoke `process-meeting` for each (or `run-lead-job` which orchestrates it). After each completes, re-run `bulk-promote-transcript-fields` to flow the new `deal_intelligence` into manual columns.

Implementation: small batched script via `bulk-process-stale-meetings` edge function, OR one-off calls from the existing Pipeline "Backfill all meetings" dropdown if it already covers this case. Will check first, prefer reusing existing button.

Expected lift: 7 leads × ~3 transcript fields = ~21 more populated cells, lifts authority/blocker totals from 43/46 to ~50/53.

### Step 2 — Investigate CT-051 broken transcript sync
4 fireflies IDs but `transcript_len = 0`. Could be a Fireflies API failure or a different sync path. Single DB query + log inspection. If fixable, add to Step 1 batch.

### Step 3 — User runs the AI batched enrichment (3rd time asking, but it's the actual fix)
Open Pipeline → "Fill SourceCo Dossiers" → **"Fill all AI gaps in batches"**. ~8 min, ~$3. Closes 447-cell gap. **No code change** — the button has been wired since 2 sessions ago.

### Step 4 — Update audit doc
Append today's results: transcript promote = +98 fields, target_criteria cleanup verified, 7-lead transcript backlog identified.

## Files touched
- Possibly NEW: `supabase/functions/bulk-process-stale-meetings/index.ts` (only if existing "Backfill" button doesn't cover this case — will verify before creating)
- Possibly: `src/components/Pipeline.tsx` — add dropdown item if function is new
- `.lovable/audit/coverage-2026-04-17.md` — append
- One investigation query for CT-051

## Trade-offs
- **Win:** ~21 more transcript-tier cells filled (free, deterministic). AI-tier 0% → ~60% after user click.
- **Cost:** ~$0 for transcript reprocess (Fireflies + GPT-4o ~$0.10/lead × 7 = ~$0.70). ~$3 for AI batch.
- **Risk:** `process-meeting` for old transcripts — same path that worked for 46 other leads.
- **Loss:** None — additive only.

## Verification
1. SQL: `deal_intelligence IS NOT NULL` count rises from 46 → ~53 active leads
2. SQL: `decision_blocker <> ''` rises from 46 → ~52
3. SQL: `firm_aum <> ''` ≥ 80 (was 0) — only after user runs Step 3
4. Open SC-T-024 (Rish Sharma) → Sales Process card now shows real Decision Blocker

