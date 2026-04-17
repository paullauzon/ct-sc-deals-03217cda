

## End-to-end audit (read against live DB + code)

### What's working ✓
| Area | State |
|---|---|
| Buyer Profile / M&A Mandate / Sales Process cards | Mounted in `LeadPanelLeftRail` for all SourceCo leads |
| 4-tier fallback (manual → AI → submission → transcript) | Wired through `HybridText`/`HybridSelect` |
| Sparkles tooltip + ✓ Confirm | Implemented in `HybridField.tsx` |
| Confirm → activity log | Audit entries written in all 3 cards |
| Dossier % chip → click-to-scroll | Header chip dispatches `scroll-to-empty-dossier`, rail listens + flashes |
| AI Insights / AI Research moved to Intelligence tab | `AIResearchSection` + `DealIntelligencePanel` rendered in middle |
| Stakeholders moved out of right rail | Now at bottom of Activity tab |
| Bulk re-enrich SourceCo button | Wired in `Pipeline.tsx` |
| `current_sourcing="false"` sanitization | Cleaned at ingest + 38 historical rows fixed |
| Self-stated stage row (verbatim) | Renders for SourceCo in BuyerProfileCard |

### What's still weak ✗ (verified live)

```
SourceCo backfill coverage (104 leads):
  buyer_type     82 / 104   ← OK (22 are role="Other"/blank)
  target_criteria 104 / 104   ← perfect
  current_sourcing 66 / 104   ← OK
  ebitda_min     22 / 104   ← LOW
  ebitda_max     20 / 104   ← LOW
  geography      26 / 104   ← LOW
  target_revenue 29 / 104   ← LOW
```

The runtime parsers in `dealDossier.ts` *do* re-derive these on every render, so the dossier UI looks better than the DB columns — but a few message phrasings still don't match (e.g. "minimum SDE is 750 K" with the trailing space, "primarily located in the midwestern US" returns "Midwestern Us" which is awkward, multi-region phrases like "Texas, Oklahoma, Louisiana"). The current parsers also miss:
- `"$1M+ EBITDA"` shorthand
- `"based in [region]"`, `"HQ in [city]"`, `"focused on [region]"`
- `"between $X and $Y"` natural language

### What's missing for max-intuitive workflow

**A. AI suggestions per dossier row never re-trigger automatically.** The `enrich-lead` `buyerProfileSuggested` block exists but only ~5 leads have it. So the AI tier of the fallback chain is mostly empty for historical leads. The "Re-enrich top 20" button is the only way today, and the rep has to know to click it.

**B. Per-card completeness is invisible.** Header shows a global %. Rep can't tell which of the 3 cards has the gap without scrolling. A tiny "5/9" chip on each card title would make scanning instant.

**C. No "Confirm All on this card" bulk action.** Confirming 8 Sparkles rows one-by-one for a hot lead is friction. A single button per card promotes everything in one click + one combined audit entry.

**D. Right rail "Signals" still leaks dossier-ish content.** `Buying Committee` (Champion / Decision Maker) duplicates the Buyer Profile rows. Those should disappear from the right rail since the dossier already shows them.

**E. Pipeline list / filters can't surface low-dossier leads.** Reps would benefit from a "Dossier <50%" filter chip to triage which SourceCo leads need enrichment before the next call.

**F. Dossier completeness ignores AI re-enrichment opportunity.** When the chip reads "45%", there's no inline "Run AI to fill gaps" affordance — the rep has to guess that the existing Enrich button (in the toolbar) will help.

## Plan

### Phase 1 — Tighten parsers + re-backfill (data quality)

1. **Expand `submissionParser.ts` regex** for the misses in the current corpus:
   - EBITDA: handle "Minimum SDE is 750 K" (space before unit), "$1M+ EBITDA", "between $X and $Y in EBITDA"
   - Geography: extract clean tokens from "primarily located in the midwestern US" → "Midwest, US"; recognize multi-region lists like "Texas, Oklahoma, Louisiana"; cover "based in", "HQ in", "focused on"
   - Revenue: handle "$1M+", "ARR of", "doing X in profit"
2. **Re-invoke `backfill-buyer-dossier`** with the upgraded parsers. Expect EBITDA + geography + revenue coverage to jump from ~25/104 → ~60/104.

### Phase 2 — Per-card completeness + bulk-confirm (UX speed)

3. **Per-card mini chip** in each `CollapsibleCard` title: "Buyer Profile · 6/9" using the same `computeDossierCompleteness` logic split per card. Trivial — extract a `computeCardCompleteness(lead, "buyerProfile" | "mandate" | "process")` helper.
4. **"Confirm all AI" per-card button** in the card header. Walks every `Hybrid*` row that has a derived value but no manual one, writes them all in a single `save({ ... })` call, logs ONE combined activity entry: `Confirmed 5 AI values: Firm type, Acq. timeline, EBITDA min, EBITDA max, Geography (sources: Form submission, AI research)`.

### Phase 3 — Trim right rail duplication

5. **Drop `Buying Committee` from `RightRailCards`.** Champion + Decision Maker already render in Buyer Profile. The right rail should be momentum-only: Deal Health, Open Commitments, Risks, Win Strategy, Similar Won, Deal Narrative. Cleaner cognitive load.

### Phase 4 — Pipeline triage

6. **"Dossier <50%" filter chip** in the Pipeline header (SourceCo system only). Uses `computeDossierCompleteness` per lead and filters to incomplete dossiers. One click → rep sees the queue of leads to enrich before next outreach.
7. **Inline "Fill gaps with AI" affordance** on the Dossier % chip when <60%. Clicking opens a confirm popover → triggers `enrich-lead` for that single lead. Closes the loop between "I see gaps" and "fill them" without leaving the lead panel.

## Files touched

- `src/lib/submissionParser.ts` — expand EBITDA / geography / revenue regex
- `src/lib/dealDossier.ts` — add `computeCardCompleteness(lead, card)`; reuse same row checks
- `src/components/dealroom/CollapsibleCard.tsx` — accept optional `count` already exists; we'll pass "5/9" via existing `count` slot or new `meta` slot
- `src/components/lead-panel/cards/{BuyerProfile,MAMandate,SalesProcess}Card.tsx` — add per-card chip + "Confirm all AI" button; expose ref-walking save batcher
- `src/components/dealroom/RightRailCards.tsx` — remove Buying Committee block
- `src/components/lead-panel/LeadPanelHeader.tsx` — when `dossier.pct < 60`, the chip becomes a dropdown: "Jump to first empty row" / "Fill gaps with AI"
- `src/components/Pipeline.tsx` (or `PipelineFilters.tsx`) — add "Dossier <50%" quick-filter chip when `system === "sourceco"`
- One re-invocation of `backfill-buyer-dossier` (no code change to the function itself, just re-run after parser upgrades)

## Trade-offs

- **Win:** Coverage of EBITDA / geography / revenue lifts from ~25% → ~60% across historical leads with zero AI cost. Per-card chip + "Confirm all" gives reps a one-glance / one-click completeness loop. Right rail stops duplicating dossier data.
- **Cost:** "Fill gaps with AI" inline button adds ~$0.01 per click (one `enrich-lead` call). Rep-triggered, opt-in, fine.
- **Loss:** Per-card chips add light visual noise to the rail. **Mitigation:** small text-[10px] muted, only renders when card is filled OR being viewed.

## Sequence

1. Expand `submissionParser.ts` regex for the live-corpus misses.
2. Re-run `backfill-buyer-dossier`; report new coverage.
3. Add `computeCardCompleteness` + per-card chips.
4. Add "Confirm all AI on this card" button to each of the 3 cards.
5. Drop Buying Committee from right rail.
6. Wire "Dossier <50%" filter into Pipeline (SourceCo only).
7. Convert Dossier % chip into a dropdown when <60% with "Fill gaps with AI" entry.
8. You verify: open SC-T-067 (Imari Sallins) → EBITDA min "$750K" populates correctly; Buyer Profile card title shows "6/9"; click "Confirm all AI" → all Sparkles rows lock in + one activity entry; right rail no longer shows Buying Committee; Pipeline header shows "Dossier <50%" chip → click filters to incomplete leads.

