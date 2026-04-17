

## Audit findings: active-stage coverage (150 leads, excl. Closed/Lost/Dark/Revisit)

### Coverage matrix
```
                    Captarget(76)   SourceCo(74)
buyer_type            75%             72%
target_criteria       97%* (garbage)  86%* (garbage)
geography             22%             31%
ebitda_min/max         0%             24%
target_revenue        24%             30%
acq_timeline           0%             68%   ← parsed from acquisition_strategy
competing_against      0%             68%   ← parsed from current_sourcing
active_searches        0%              1%
firm_aum               0%              0%   ← AI-tier never wrote
deal_type              0%              0%   ← AI-tier never wrote
transaction_type       0%              0%   ← AI-tier never wrote
authority_confirmed    0%              0%   ← needs transcripts
budget_confirmed       0%              0%   ← needs transcripts
decision_blocker       0%              0%   ← needs transcripts
stall_reason           0%              0%   ← needs transcripts
```

### Three real problems

**Problem 1 — `target_criteria` still pollutes with low-signal phrases.**
Examples found in active SC leads:
- SC-I-001: "Discuss partnership opportunities and mutual synergies"
- SC-I-003: "Getting off-market deals"
- SC-I-006: "Help to connect with off market businesses"
- SC-I-007: "One-man independent sponsor looking to outsource deal sourcing"
- SC-I-019: "Want to understand off market deal sourcing for specific sectors"
- SC-I-021/022: "Deal sourcing", "Sourcing deals"

Current denylist matches whole-string only, and the 20-char floor lets through "Help to connect with off market businesses" (40 chars, but zero sector signal). Need a **semantic gate**: must contain at least one industry/vertical noun (e.g., from a vocab list: SaaS, healthcare, manufacturing, services, B2B, distribution, accounting, landscaping, etc.) OR an explicit financial/geographic anchor.

**Problem 2 — `competing_against` is just a copy of `current_sourcing`, which is often a non-answer.**
SC-T-006/64/67 all show `competing_against = "We're exploring options"` / `"We're in thesis-building mode"` — these are the **acquisition strategy** dropdown bleeding through, not actual competitors. The current promoter blindly copies `current_sourcing` even when it's the canned "thesis-building" / "exploring" / "mid-process" phrases. Need to **denylist those exact strings** in `parseCompetingFromSourcing`.

**Problem 3 — AI-tier fields (firm_aum, deal_type, transaction_type) are 0% across 150 active leads.**
The auto-persist code lives in `bulk-enrich-sourceco` but it only ran on a 20-lead cap and only for SourceCo. Captarget leads have **never** been touched by AI dossier enrichment. The 5 transcript-tier fields will stay 0% until reps actually hold meetings — that's structural and the "Awaiting first meeting" placeholder already handles it.

## Plan

### 1. Tighten `target_criteria` parser with a semantic gate
- Add an **industry/anchor vocab** check in `parseSectorFromText`: result must contain ≥1 token from a curated vocab (industries, verticals, financial anchors like "$", "EBITDA", "revenue", "acquisition", or geographic markers) — OR be ≥40 chars AND contain at least one capitalized non-stopword.
- Expand denylist with phrase-contains rules (not just whole-string): `/\b(deal sourcing|off-?market|partnership opportunities|sourcing support|sourcing deals|mutual synergies|outsource deal|buyers?\/sellers? matching|buy-?side option|channel partners|learn more|understand off|deploy growth equity|pipeline (of |building))\b/i` → reject.
- Run a one-off SQL to nullify the ~25 active leads currently holding garbage `target_criteria`.

### 2. Fix `competing_against` to ignore acquisition-strategy bleed
- In `parseCompetingFromSourcing`, denylist values that match the acquisition_strategy canned options: `/^(we['']re |we are )?(in thesis|exploring|actively sourcing|under loi|in diligence|mid[- ]process|opportunistic|closing)/i` → return `""`.
- One-off SQL to nullify active leads where `competing_against` matches that pattern.

### 3. Extend bulk-promote to Captarget + lift bulk-enrich cap
- `bulk-promote-dossier`: drop the `brand = SourceCo` filter (or accept `brand: "all"`), then re-run. Captarget has `message` text too — `parseEbitdaFromText`/`parseRevenueFromText`/`parseGeographyFromText` work brand-agnostic.
- `bulk-enrich-sourceco`: rename concept to `bulk-enrich-dossier`, raise cap to all active non-archived leads with empty `firm_aum`, run for both brands. Cost: ~$3 one-time across 150 leads.
- Add a Pipeline header dropdown entry: **"Re-enrich all active dossiers (AI)"** alongside the existing "Promote parsed values now".

### 4. Audit-log impact
After re-runs, expected new coverage:
- `target_criteria` clean rate: 100% (no garbage), but raw count drops to ~110 (down from 150) — that's **correct**, not a regression.
- `acq_timeline` Captarget: 0 → ~30% (only leads with parseable timing language)
- `firm_aum`/`deal_type`/`txn_type`: 0% → ~60% across all active leads (AI-driven, only writes high-confidence)
- `geography`/`ebitda` Captarget: small lift from explicit numeric mentions in messages

### 5. Verification SQL
Re-run the coverage matrix; confirm garbage examples (SC-I-001, SC-I-003, SC-I-021) now show `NULL` for `target_criteria`; confirm SC-T-067 shows non-empty `firm_aum` post-enrich.

## Files touched
- `src/lib/submissionParser.ts` + `supabase/functions/bulk-promote-dossier/index.ts` — denylists for sector + competing
- `supabase/functions/bulk-promote-dossier/index.ts` — drop brand filter
- `supabase/functions/bulk-enrich-sourceco/index.ts` — raise cap, both brands, rename concept (keep old name for back-compat)
- `src/components/Pipeline.tsx` — add "Re-enrich all active (AI)" dropdown item
- One SQL migration — nullify garbage `target_criteria` + bleeding `competing_against` in active leads

## Trade-offs
- **Win:** Parser gates raise *truth quality* — fewer fake fills, so the dossier % chip becomes a credible signal (today it's inflated by junk).
- **Cost:** ~$3 in OpenAI for the cross-brand AI re-enrich.
- **Risk:** Tightening sector parser drops `target_criteria` raw count — reps see more "—" in cards. **Mitigation:** UI already shows the form `message` in the Original Message card, so the data isn't lost, just not surfaced as a parsed sector.
- **Loss:** Captarget `acq_timeline` will stay sparse because the source field (`acquisition_strategy`) is SourceCo-form-only. Acceptable — it's a real data limitation, not a bug.

