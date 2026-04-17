

## Goal

Add a **Buyer Profile / M&A Mandate / Sales Process** dossier to the left rail of every SourceCo lead (and a leaner Captarget version), populated automatically from three sources: the **submission message**, the **Fireflies transcripts/intelligence**, and the **AI research** — with manual override on every field.

## What we have vs. what we need

```
SCREENSHOT FIELD              EXISTS?   SOURCE TODAY                     GAP
────────────────────────────  ───────   ───────────────────────────────  ──────────────────
BUYER PROFILE
  Firm type                   ✓         lead.buyerType                   relabel only
  Firm AUM                    ✗         —                                NEW field, AI-infer
  Acq. timeline               ◐         enrichment.urgency (free text)   normalize → enum
  Stakeholders                ✓ derived dealIntelligence.stakeholderMap  count + show
  Champion                    ✓ derived stakeholderMap[stance=Champion]  pick top
  Active searches             ✗         —                                NEW, AI-infer
  Budget confirmed            ◐         dealSignals.budgetMentioned      normalize → Y/N/?
  Authority confirmed         ✗         —                                NEW, infer from DM

M&A MANDATE
  Target sector(s)            ◐         targetCriteria (free text)       parse → tags
  Target geography            ✓         lead.geography                   reuse
  EBITDA min / max            ✗         —                                NEW pair
  Revenue range               ✓         lead.targetRevenue               reuse
  Deal type                   ✓         lead.acquisitionStrategy         relabel
  Transaction type            ✗         —                                NEW (majority/minority/control)

SALES PROCESS (our side)
  Competing against           ✓         competingBankers + objections    merge
  Decision blocker            ◐ derived riskRegister[severity=Critical]  pick top
  Sample sent date            ✗         —                                NEW date
  Sample outcome              ✗         —                                NEW enum
  Proof notes                 ✗         —                                NEW free text
  Stall reason                ◐ derived momentumSignals.momentum=Stalled NEW free text override
```

So: ~7 of 22 fields exist verbatim, ~6 are derivable from AI/Fireflies output, ~9 are net-new and need DB columns + extraction prompts.

## Plan

### 1. DB migration — add the missing fields

Single migration adds these `nullable text/date/numeric` columns to `leads`:
```
firm_aum, acq_timeline, active_searches, budget_confirmed, authority_confirmed,
ebitda_min, ebitda_max, deal_type, transaction_type,
competing_against, decision_blocker,
sample_sent_date, sample_outcome, proof_notes, stall_reason
```
Plus mirror them in `src/types/lead.ts` and `leadDbMapping.ts`.

All nullable → no migration risk. No new tables (these are all 1:1 with the lead).

### 2. Three new collapsible cards in the left rail (SourceCo only — Captarget gets a slimmed Buyer Profile only, since EBITDA/transaction-type are PE-specific)

Files: `src/components/lead-panel/cards/BuyerProfileCard.tsx`, `MAMandateCard.tsx`, `SalesProcessCard.tsx`. Each uses the existing `CollapsibleCard` + `InlineSelectField`/`InlineTextField` pattern, so every field is **inline-editable** like Key Information already is. This matches what's already there — no new UI primitives.

The current `AcquirerProfileCard` (which currently overlaps Buyer Profile) gets **deleted** — its 6 fields are absorbed into the new Buyer Profile + M&A Mandate cards.

The standalone "M&A Criteria" CollapsibleCard wrapping `MACriteriaCard` (line 146-150 of `LeadPanelLeftRail`) also gets deleted — fully superseded.

### 3. Auto-derived values (no manual work needed)

A small helper `src/lib/dealDossier.ts` exposes pure functions like:
- `deriveStakeholderCount(lead)` → `dealIntelligence.stakeholderMap.length`
- `deriveChampion(lead)` → first `stakeholderMap[stance="Champion"].name`
- `deriveCompetingAgainst(lead)` → unique union of `competingBankers` + `dealIntelligence.objectionTracker[].competitors` + `meetings[*].intelligence.dealSignals.competitors`
- `deriveDecisionBlocker(lead)` → top open `Critical`/`High` `riskRegister` entry
- `deriveStallReason(lead)` → if `momentumSignals.momentum` ∈ {Stalled, Stalling}, surface `dealStageEvidence`
- `deriveBudgetConfirmed(lead)` → maps `dealSignals.budgetMentioned` to Yes/No/Unclear

The card renders `manualValue ?? derivedValue`, with a tiny `AI` chip beside derived values so the rep knows it came from a transcript and can override with a click. This is the same dual-source pattern that already powers `enrichment.suggestedUpdates` on the AI Research section, so the user model is consistent.

### 4. AI extraction — extend `enrich-lead` and `synthesize-deal-intelligence`

Add a new structured-output block to `enrich-lead`'s response schema:
```
buyerProfileExtracted: {
  firmAum, acqTimeline, activeSearches,
  ebitdaMin, ebitdaMax, dealType, transactionType,
  authorityConfirmed
}
```
This pulls from: the submission `message` (free-text intro), `targetCriteria`/`targetRevenue` parsing, and the company's website (already scraped). Stored on `enrichment.buyerProfileSuggested` so it flows through the existing **suggested updates** workflow — the rep accepts/rejects exactly like any other suggestion. Zero new accept/reject UI.

`synthesize-deal-intelligence` already extracts everything we need for derived fields, so no change there.

### 5. Reorder the left rail

Final stack (top to bottom):
```
About / Identity (actions)
─── Key Information
─── Deal Economics
─── Buyer Profile           ← NEW (replaces Acquirer Profile)
─── M&A Mandate             ← NEW (replaces standalone M&A Criteria card)
─── Sales Process           ← NEW
─── Mutual Plan
─── Dates
─── Source & Attribution
─── Submissions
─── Website Activity
─── Won/Lost details (when closed)
─── Original Message
```

This keeps the dossier reading top-down: who we're selling to → what they want to buy → where we are in selling them.

## Trade-offs

- **Win:** the screenshot's full PE-buyer dossier renders with most fields pre-populated from existing transcripts & enrichment. Reps see champion, competitors, and stall reason without opening the Intelligence tab.
- **Win:** No new UI primitives — reuses `CollapsibleCard` + `InlineSelectField` already powering Key Information.
- **Cost:** 15 new nullable columns. Acceptable: they're all small, they map 1:1 to a lead, no relational complexity.
- **Cost:** `enrich-lead` prompt grows ~30%. Acceptable: same call, same model, ~5% cost bump.
- **Loss:** Captarget leads see fewer of these fields (PE-specific). **Mitigation:** Buyer Profile renders for both brands; M&A Mandate + Sales Process are SourceCo-only, gated by `lead.brand === "SourceCo"`.

## Sequence

1. DB migration — add 15 nullable columns; update `Lead` type + `leadDbMapping`.
2. Build `dealDossier.ts` derivation helpers (pure, unit-testable).
3. Build the three new card components.
4. Wire into `LeadPanelLeftRail`; delete `AcquirerProfileCard` + the standalone M&A Criteria block.
5. Extend `enrich-lead` schema + prompt to populate `buyerProfileSuggested`; route through existing suggestion-acceptance UI.
6. You verify: open a SourceCo lead with meetings → confirm champion/stakeholder count/competitors/stall reason auto-fill from Fireflies; click Re-run Research → confirm firmAUM/EBITDA/dealType suggestions appear in the Intelligence tab; confirm every field is click-to-edit.

