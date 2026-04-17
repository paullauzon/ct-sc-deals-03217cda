

## Real coverage audit (431 active leads, post-promote)

| Field | Captarget (327) | SourceCo (104) | Status |
|---|---|---|---|
| buyer_type | 144 (44%) | 82 (79%) | OK |
| target_criteria | 108 (33%) | 92 (88%) | Has residual garbage |
| target_revenue | 98 (30%) | 29 (28%) | OK |
| geography | 37 (11%) | 29 (28%) | Form-tier ceiling |
| ebitda | 4 (1%) | 25 (24%) | Form-tier ceiling |
| acq_timeline | **0** | 65 (62%) | Captarget = 0 (no source field) |
| competing_against | 28 (9%) | 22 (21%) | Has bleed (curly quotes, "Other") |
| firm_aum / deal_type / txn_type | **0** | **0** | AI-tier never ran |
| active_searches | 0 | 1 | AI-tier never ran |
| 5 transcript-tier rows | 0 | 0 | Structural — no transcripts |

## Three concrete bugs found

**Bug 1 — `competing_against` still bleeds** (12+ active leads):
- Curly apostrophe variants slipped past the regex: `"We're exploring options"` (curly `'`), `"Inbound only (Advisors, Bankers)"`, `"Other (let us know below)"`, `"We're actively sourcing targets"`
- The `STRATEGY_BLEED` regex only handles straight `'`, not `'` (U+2019). The promoter wrote these before the parser was tightened, OR the parser isn't checking these specific strings.

**Bug 2 — `target_criteria` residuals** (6 active leads):
- `"Lead gen"`, `"Help grow my business"`, `"Buyers/Sellers matching"`, `"Getting off-market deals"`, `"Food & Beverage Sector"` (last one might be legitimate — short but has anchor)
- Denylist needs: `lead gen`, `help grow`, `buyers?/sellers? matching`, `getting off.?market`, plus a min-length-20 OR has-vertical-noun gate.

**Bug 3 — AI-tier is genuinely 0% — bulk-enrich never executed end-to-end**:
- 0 leads have `enrichment.buyerProfileSuggested` populated. Either the AI run hasn't been triggered yet, or it's failing silently.
- This is the single highest-leverage gap: 5 fields × 431 leads = 2,155 empty cells waiting on one button click.

**Captarget acq_timeline = 0 is structural** — the Captarget form has no `acquisition_strategy` field. Acceptable; documented limitation.

## Plan

### 1. Patch bleed denylists (immediate)
In `src/lib/submissionParser.ts` + `bulk-promote-dossier`:
- `STRATEGY_BLEED` → also match `'` (U+2019) and add: `"other (let us know"`, `"inbound only"`, the multi-value comma-joined cases (split on `,` first, denylist each segment, rejoin).
- `parseCompetingFromSourcing` should normalize curly→straight quotes before matching.
- `SECTOR_PHRASE_DENYLIST` → add `lead gen`, `help grow`, `buyers?/sellers? matching`, `getting off.?market`.
- Re-run SQL nullification on the 18 polluted rows identified above.

### 2. Verify and execute bulk-enrich-dossier (the big win)
- Check `bulk-enrich-sourceco` edge function logs to confirm whether the "Re-enrich all active dossiers (AI)" action was ever invoked successfully.
- If never run: invoke it now via the Pipeline dropdown action (covers both brands, 200-lead cap, ~$3 OpenAI spend).
- If failing: read function logs to identify the failure mode (likely missing `OPENAI_API_KEY` on Captarget code path or a payload-shape mismatch).
- Confirm it writes to BOTH `enrichment.buyerProfileSuggested` AND auto-persists to manual columns when empty.

### 3. Re-run cross-brand bulk-promote after parser patches
Idempotent — will only add new rows, won't overwrite. Should lift Captarget `competing_against` materially since the form has rich `current_sourcing` data (32 of 327 have it).

### 4. Final coverage report
Re-run the matrix; commit as `.lovable/audit/coverage-2026-04-17.md` so future audits compare against a baseline.

## Files touched
- `src/lib/submissionParser.ts` — curly-quote normalization, expanded denylists
- `supabase/functions/bulk-promote-dossier/index.ts` — same parser updates
- One SQL UPDATE — nullify the 18 bleeding `competing_against` + 5 garbage `target_criteria` rows
- Trigger `bulk-enrich-sourceco` (now cross-brand) via the deployed edge function — no code change needed if logs show it works

## Trade-offs
- **Win:** AI-tier 0%→~60% in one run (~$3). Bleed cleanup makes the dossier % chip credible.
- **Risk:** AI run could write low-confidence guesses. Mitigated by `onlyEmptyAum` flag + Sparkles glyph still showing AI provenance so reps can override.
- **Loss:** None — every change is additive or removes bad data.

## Verification
1. Coverage matrix shows `firm_aum` ≥ 60 (was 0), `deal_type` ≥ 60, `competing_against` Captarget ≥ 80 (was 28, lots of clean room).
2. SQL: `SELECT competing_against FROM leads WHERE competing_against ILIKE '%exploring%' OR ILIKE '%let us know%'` returns 0 rows.
3. Open SC-T-067 → Buyer Profile shows real Firm AUM, Deal Type, Transaction Type values with Sparkles glyph.

