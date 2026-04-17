

## Audit findings — 150 active leads (Captarget 76 + SourceCo 74)

### Coverage matrix vs. previous baseline

| Field | CT (76) | SC (74) | Δ vs prior session | Diagnosis |
|---|---|---|---|---|
| buyer_type | 57 (75%) | 53 (72%) | unchanged | OK |
| target_criteria | 54 (71%) | 55 (74%) | ↓ 8 (cleanup of 13 garbage rows landed; some lifted by re-promote) | **8 residual borderline rows** |
| target_revenue | 18 (24%) | 22 (30%) | unchanged | Form-tier ceiling |
| geography | 22 (29%) | 23 (31%) | unchanged | Form-tier ceiling |
| ebitda | 2 (3%) | 19 (26%) | unchanged | Form-tier ceiling |
| acq_timeline | **0** | 50 (68%) | unchanged | CT structural (no source field) |
| competing_against | 14 (18%) | 4 (5%) | unchanged | Bleed denylist working — 0 polluted rows |
| **firm_aum / deal_type / txn_type / active_searches** | **0 / 0 / 0 / 0** | **0 / 0 / 0 / 1** | **unchanged** | **AI-tier batched run never executed** |
| 4 transcript-tier rows | 0 | 0 | unchanged | Structural — needs meetings |
| has enrichment JSON | 0 | 1 | unchanged | Confirms zero AI runs landed |

### Three findings

**Finding 1 — AI-tier is still 0% across 149 of 150 leads.**
The "Fill all AI gaps in batches" dropdown shipped last session, but no one ran it. `enrichment IS NOT NULL` returns 0 rows for Captarget and 1 for SourceCo (a single legacy artifact). The fix exists in the UI; it just needs one click. This is the single highest-value remaining gap — 596 empty cells (149 × 4 fields) waiting on ~8 minutes / ~$3.

**Finding 2 — 8 residual `target_criteria` rows are borderline-garbage.**
Cleanup nullified 13 known-bad rows; re-promote re-wrote some with the new tighter parser. But 8 rows still slipped through:
- CT-064 "Sourcing off-market qualified opportunities" — should be filtered (the `off-market` denylist isn't matching because the parser only checks input message, not already-promoted column values)
- CT-218 "I am the newly appointed head of deal origination" — self-description, not criteria
- CT-069 "origination support to connect with leading franchisees" — vague
- SC-I-006 "Help to connect with off market businesses" — phrase denylist miss
- SC-T-006 "Understanding how SourceCo aggregates target lists…" — meta question
- (CT-004, CT-046, SC-T-045 are **legitimate** — keep — they have sector + geography signal)

**Finding 3 — `current_sourcing` ceiling for `competing_against` is real, not fixable.**
27 SourceCo + 3 Captarget rows have `current_sourcing` text that's purely the canned dropdown ("We're actively sourcing targets", "thesis-building", "exploring options", "mid-process"). The bleed denylist is **correctly rejecting** these as non-competitor information. Coverage looks low (4/74 SC, 14/76 CT) but it's actually 100% of the *addressable* pool. **No action needed.**

### What remains structural (no fix)
- Captarget `acq_timeline = 0` — form has no `acquisition_strategy` field
- 4 transcript-tier rows (`authority_confirmed`, `budget_confirmed`, `decision_blocker`, `stall_reason`) — need actual meetings
- `current_sourcing` filler — correct rejection

## Plan

### Step 1 — Run the existing batched AI enrichment (the actual fix)
The dropdown is wired. Open Pipeline → "Fill SourceCo Dossiers" → **"Fill all AI gaps in batches"**. It will loop `bulk-enrich-sourceco` in batches of 10 until all 149 leads with empty `firm_aum` are processed. Live progress in the button label. ~8 min, ~$3.

This is a **user action**, not a code change. After the run, expect:
- `firm_aum` 0 → ~90 (60% of 149)
- `deal_type` 0 → ~90
- `transaction_type` 0 → ~90
- `enrichment IS NOT NULL` 1 → ~149

### Step 2 — Nullify the 5 borderline `target_criteria` rows
One SQL UPDATE clearing CT-064, CT-069, CT-218, SC-I-006, SC-T-006. The re-promote already ran, so these won't be auto-rewritten unless the message text contains real signal (it doesn't for these 5 — they'll stay correctly empty).

### Step 3 — Tighten the `target_criteria` parser one more notch
In `src/lib/submissionParser.ts` and `bulk-promote-dossier`, add to `SECTOR_PHRASE_DENYLIST`:
- `/\bsourcing off.?market\b/i`
- `/\borigination support\b/i`
- `/\bunderstanding how (sourceco|captarget)\b/i`
- `/\bnewly appointed\b/i`
- `/\bhelp to connect\b/i`

This prevents future ingest from re-introducing the same patterns.

### Step 4 — Update audit baseline
Append post-run results to `.lovable/audit/coverage-2026-04-17.md` so we can see the AI-tier jump from 0% → ~60% as a discrete milestone.

## Files touched
- `src/lib/submissionParser.ts` — 5 phrase additions to denylist
- `supabase/functions/bulk-promote-dossier/index.ts` — same 5 additions (mirror)
- One SQL UPDATE — nullify 5 borderline `target_criteria` rows
- `.lovable/audit/coverage-2026-04-17.md` — append post-batch baseline
- **No Pipeline.tsx changes needed** — batched dropdown already shipped

## Trade-offs
- **Win:** AI-tier 0% → ~60% (the long-deferred gap finally closed). Parser hardening prevents the same 5 phrase patterns from re-polluting on future ingest.
- **Cost:** ~$3 OpenAI one-time. ~8 min user wall time with Pipeline tab open.
- **Risk:** AI may write low-confidence guesses into manual columns. **Mitigated by** existing `onlyEmptyAum` flag (only fills empty cells) + Sparkles glyph showing AI provenance + reps can override with one click.
- **Loss:** None — additive only.

## Verification
1. SQL: `SELECT COUNT(*) FROM leads WHERE firm_aum <> '' AND archived_at IS NULL AND stage NOT IN ('Lost','Revisit/Reconnect','Went Dark','Closed Won')` → ≥80 (was 0)
2. SQL: `SELECT COUNT(*) FROM leads WHERE enrichment IS NOT NULL AND archived_at IS NULL AND stage NOT IN ('Lost','Revisit/Reconnect','Went Dark','Closed Won')` → ≥140 (was 1)
3. Open CT-053 (Felipe Esquivel) → Buyer Profile renders Firm AUM with Sparkles glyph instead of "—"
4. Open SC-T-067 (Imari Sallins) → all 9 Buyer Profile rows show real values
5. SQL: `target_criteria ILIKE '%off-market%'` returns 0 active rows

