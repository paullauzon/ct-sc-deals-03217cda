

## Audit — 150 active leads (CT 76 + SC 74)

### Coverage matrix vs. previous baseline

| Field | CT (76) | SC (74) | Δ | Diagnosis |
|---|---|---|---|---|
| buyer_type | 57 (75%) | 53 (72%) | — | OK |
| target_criteria | 51 (67%) | 53 (72%) | ↓ 3 each (parser tightening dropped a few) | **14 still weak** (see below) |
| target_revenue | 18 | 22 | — | Form-tier ceiling |
| geography | 22 | 23 | — | Form-tier ceiling |
| ebitda | 2 | 19 | — | Form-tier ceiling |
| acq_timeline | **0** | 50 (68%) | — | CT structural (no source field) |
| competing_against | 14 | 4 | — | 100% of addressable pool |
| **firm_aum / deal_type / txn_type** | **0 / 0 / 0** | **0 / 0 / 0** | — | **AI-tier still 0%** |
| has enrichment JSON | 0 | 1 | — | **Confirms zero AI runs landed** |
| 4 transcript-tier rows | 0 | 0 | — | Structural |

### Findings

**Finding 1 — AI-tier is STILL 0% across 149 of 150 leads.** Same as last session. The "Fill all AI gaps in batches" dropdown was shipped but never executed by anyone. This is the dominant remaining gap: **596 empty cells** (149 leads × 4 fields).

**Finding 2 — 14 borderline `target_criteria` rows.** Mix of legitimate-but-short and weak/garbage:
- **Legitimate, KEEP** (5): CT-004 (outbound origination thesis), CT-024 (pump services Germany), CT-046 (manufacturing Montreal), SC-T-029 (IoT verticals), SC-T-045 (PE origination 2-20M EBITDA Benelux), SC-I-011 (corporate growth equity)
- **Weak/garbage, NULLIFY** (8): CT-016 (roll-up only — borderline keep), CT-018 (thematic sourcing), CT-028 (scale dealflow), CT-047 ("know more about what you do"), CT-062 (acquire a platform business), SC-T-004 (M&A advisory India), SC-T-033 (matching targets), SC-T-042 (find list of sellers)

**Finding 3 — `deal_intelligence` exists for 46 leads (29 CT + 17 SC) but NONE of those rich extracts have populated `authority_confirmed`, `budget_confirmed`, `decision_blocker`, `stall_reason`.** Transcript-tier promotion never wired up. 1 CT lead has CT-018-style values in those fields but it's an outlier — confirms field exists, just isn't being filled from `deal_intelligence` JSON.

**This is a NEW finding** — not flagged in prior audits. 46 leads have meeting transcripts processed, yet 0 have transcript-derived dossier values.

### What stays structural (no fix)
- CT `acq_timeline = 0` — form lacks field
- 109 leads with no meetings yet — `authority_confirmed` etc. genuinely unknowable

## Plan

### Step 1 — Promote transcript-tier values from `deal_intelligence` JSON (NEW)
46 leads have rich `deal_intelligence` payloads sitting unused. The `process-meeting` extractor populates `dealIntelligence.stakeholderMap`, `riskRegister`, `momentumSignals`, etc. — but no code path writes the inferred `authority_confirmed` / `budget_confirmed` / `decision_blocker` / `stall_reason` into manual columns.

**Add a `bulk-promote-transcript-fields` edge function** (mirrors `bulk-promote-dossier` pattern) that:
- Scans active leads with `deal_intelligence IS NOT NULL` AND target column empty
- Maps `deal_intelligence.authorityMap.confirmed` → `authority_confirmed`
- Maps `deal_intelligence.budgetSignals.confirmed` → `budget_confirmed`
- Maps `deal_intelligence.riskRegister[0].blocker` → `decision_blocker`
- Maps `deal_intelligence.momentumSignals.stallReason` → `stall_reason`
- Logs `field_update` activity entry per lead
- Add 4th dropdown item in Pipeline header: **"Promote transcript values"**

Expected lift: ~30 leads will get 1-3 of these fields filled.

### Step 2 — Nullify 8 weak `target_criteria` rows
SQL UPDATE for: CT-018, CT-028, CT-047, CT-062, SC-T-004, SC-T-033, SC-T-042 (CT-016 is borderline — keep "roll up of industrial businesses Canada" since it has sector+geography signal).

### Step 3 — Tighten parser denylist
Add to `SECTOR_PHRASE_DENYLIST` in `src/lib/submissionParser.ts` and `bulk-promote-dossier`:
- `/\bthematic sourcing\b/i`
- `/\bscale (our )?dealflow\b/i`
- `/\bacquire a platform\b/i`
- `/\bm&a advisory\b/i`
- `/\bmatching targets?\b/i`
- `/\bfind (a )?list of sellers\b/i`

### Step 4 — Run AI-tier batched enrichment (USER ACTION required)
Open Pipeline → "Fill SourceCo Dossiers" → **"Fill all AI gaps in batches"**. ~8 min, ~$3. Closes 596-cell gap.

### Step 5 — Update audit baseline
Append all results to `.lovable/audit/coverage-2026-04-17.md`.

## Files touched
- **NEW**: `supabase/functions/bulk-promote-transcript-fields/index.ts`
- `src/components/Pipeline.tsx` — add 4th dropdown item invoking new function
- `src/lib/submissionParser.ts` — 6 phrase additions
- `supabase/functions/bulk-promote-dossier/index.ts` — same 6 additions (mirror)
- One SQL UPDATE — nullify 7 weak `target_criteria` rows
- `.lovable/audit/coverage-2026-04-17.md` — append

## Trade-offs
- **Win:** Transcript-tier fields jump from 0% → ~20% (deterministic, free). AI-tier 0% → ~60% after user clicks the existing button (~$3). Final addressable gaps closed.
- **Cost:** ~$3 OpenAI one-time. Code change ~1 new edge function + parser tweaks.
- **Risk:** Transcript JSON shapes vary across `process-meeting` versions. **Mitigation:** new function uses optional chaining, only writes when value is non-empty string and column is empty.
- **Loss:** None — all additive.

## Verification
1. SQL: `firm_aum <> ''` count → ≥80 (was 0) after user runs batch enrich
2. SQL: `authority_confirmed <> '' OR decision_blocker <> ''` → ≥15 (was ~1)
3. SQL: `target_criteria` rows matching weak phrases → 0
4. Open SC-I-040 (any lead with `deal_intelligence`) → Sales Process card shows real Decision Blocker / Stall Reason

