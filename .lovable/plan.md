

## Audit findings — 150 active leads (Captarget 76 + SourceCo 74; excludes Lost / Revisit/Reconnect / Went Dark / Closed Won)

### Coverage matrix

| Field | Captarget (76) | SourceCo (74) | Diagnosis |
|---|---|---|---|
| buyer_type | 57 (75%) | 53 (72%) | OK |
| target_criteria | 62 (82%) | 59 (80%) | **13 still garbage** (see below) |
| target_revenue | 18 (24%) | 22 (30%) | Form-tier ceiling |
| geography | 22 (29%) | 23 (31%) | Form-tier ceiling |
| ebitda | 2 (3%) | 19 (26%) | Form-tier ceiling |
| acq_timeline | **0** | 50 (68%) | Captarget = structural (no source field) |
| competing_against | 14 (18%) | 4 (5%) | SourceCo low because 46 leads have only "We're actively sourcing targets" / "thesis-building" — correctly filtered |
| firm_aum / deal_type / txn_type / active_searches | **0 / 0 / 0 / 0** | **0 / 0 / 0 / 1** | **AI-tier never executed end-to-end** |
| 4 transcript rows (auth/budget/decision blocker/stall) | 0 | 0 | Structural — needs meetings |

### Three concrete issues

**Issue 1 — 13 garbage `target_criteria` rows survived parser tightening.**
These were written by an *older parser* before the denylist landed. The bulk-promote code is idempotent (only writes when empty) so it never re-cleans existing rows. Examples:
- CT-005 "finding out more about what you do"
- CT-011 "I would welcome an intro call to learn more about your business model and how you work"
- CT-020 "Looking to speak someone in partnerships"
- CT-026 "We are looking to accelerate our roll up strategy"
- CT-053 "Reaching out to know how to list sell side mandates on the portal"
- CT-060 "Exploring options to get more at-bats"
- CT-061 "Scale our origination beyond internal sources"
- CT-075 "We are looking to learn more about your services"
- SC-I-001 "Discuss partnership opportunities and mutual synergies"
- SC-I-014 "I'd like to learn more about your sourcing platform"
- SC-T-014 "across industries and sizes"
- SC-T-021 "Looking to acquire a few SMBs"
- (CT-024 "pump services in Germany" + CT-433 "cross-border transactions" + SC-T-046 "Risk Management SaaS firms" are **legitimate** — keep)

**Issue 2 — AI-tier (firm_aum / deal_type / transaction_type / active_searches) is 0% across all 150 active leads.**
Last session's audit doc explicitly recommended **client-driven batches of ~10 leads** to sidestep the 150s edge proxy timeout that killed both sync and `EdgeRuntime.waitUntil` background runs. That batch flow was never built. The Pipeline header still only exposes "Re-enrich with AI (top 20)" — there's no full-coverage option, and no progress UI.

**Issue 3 — `competing_against` low Captarget coverage is largely structural, not a bug.**
Only 17 Captarget leads have any `current_sourcing` text at all (the form rarely captures it). 14 of those 17 have been promoted. That's already 82% of the addressable pool. Acceptable.

### What I am NOT proposing to fix
- Captarget `acq_timeline` (no source field — documented limitation)
- 4 transcript-tier rows (need actual meetings — UI already shows "Awaiting first meeting")
- SourceCo `competing_against` low count (form data is filler — correct rejection)

## Plan

### 1. Cleanup pass — nullify the 13 garbage `target_criteria` rows
One-time SQL UPDATE setting `target_criteria = ''` for the 13 specifically identified IDs (Captarget 8 + SourceCo 4 + 1 borderline review). Then re-run `bulk-promote-dossier` so the strengthened parser gets a chance to write a clean value if the message contains real signal (most won't — these will simply remain blank, which is the right answer).

### 2. Client-driven batched AI enrichment — the long-deferred fix
Add a third dropdown item in `src/components/Pipeline.tsx` Dossier Coverage menu:
> **"Fill all AI gaps in batches"** — runs `bulk-enrich-sourceco` repeatedly with `limit: 10` and a target brand/`onlyEmptyAum: true` filter, looping client-side until the function returns `scanned: 0`. Shows live progress: `"Enriching 30 / 150 — firm_aum coverage 18%"`.

Implementation:
- New state: `enrichProgress: { done: number; total: number; aumFilled: number } | null`
- Loop body: invoke function, accumulate counters, refresh leads between batches so the UI Sparkles glyphs appear progressively.
- Stop conditions: function returns `scanned: 0`, OR 25 batches consumed (250 leads safety cap), OR user cancels via a "Stop" button.
- Each batch ≈ 30s wall time (well under 150s timeout). 15 batches × 30s ≈ **8 minutes total** for ~150 leads at ~$3 OpenAI cost.

No edge function code changes needed — the existing `bulk-enrich-sourceco` already supports `{ limit, brand, onlyEmptyAum }`. Just orchestrate it from the client.

### 3. Verification
After running both cleanup + batched enrich:
- SQL: `target_criteria` rows containing "learn more" / "speak someone" / "partnership opportunities" → 0
- SQL: `firm_aum <> ''` → ≥80 across active leads (was 0)
- SQL: `deal_type <> ''` → ≥80 (was 0)
- Open CT-053 (Felipe Esquivel) → Buyer Profile renders Firm AUM with Sparkles glyph instead of "—"
- Update `.lovable/audit/coverage-2026-04-17.md` with new baseline

## Files touched
- `src/components/Pipeline.tsx` — add 3rd dropdown item with batched-loop logic + progress toast
- One SQL UPDATE — nullify the 13 specifically identified garbage `target_criteria` rows
- (No edge function changes — `bulk-enrich-sourceco` already accepts the right params)
- `.lovable/audit/coverage-2026-04-17.md` — append post-batch results

## Trade-offs
- **Win:** AI-tier 0% → ~60% in one ~8-minute batch run. Final addressable gaps eliminated.
- **Cost:** ~$3 OpenAI one-time spend.
- **Risk:** User must keep the Pipeline tab open during the 8-min run. **Mitigation:** progress toast + each batch is independent, so partial success is preserved if interrupted.
- **Loss:** None — additive only.

