

## Goal

Re-trigger `backfill-buyer-dossier` (now with expanded parsers), report coverage, then add the **"Dossier <50%" pipeline filter chip** (SourceCo only) and **"Fill gaps with AI" dropdown** on the Dossier % chip when completeness is <60%.

## Plan

### 1. Re-trigger `backfill-buyer-dossier`
- Invoke deployed function via service-role POST.
- Query before/after counts on `ebitda_min`, `ebitda_max`, `geography`, `target_revenue`, `buyer_type` (SourceCo, not archived).
- Report deltas.

### 2. Pipeline "Dossier <50%" filter chip
- `src/components/PipelineFilters.tsx`: add a quick-filter chip `Dossier <50%`, shown only when at least one SourceCo lead exists in the active system.
- `src/components/Pipeline.tsx`: add `dossierGap` boolean to filter state; when true, filter visible leads by `computeDossierCompleteness(lead).pct < 50` (and `lead.brand === "SourceCo"`).
- Reuses existing chip styling — monochrome, no alarm color (per design memory).

### 3. "Fill gaps with AI" dropdown on Dossier chip (<60%)
- `src/components/lead-panel/LeadPanelHeader.tsx`: when `dossier.pct < 60`, wrap the chip in a `DropdownMenu` with two items:
  - **Jump to first empty row** → existing `scroll-to-empty-dossier` event
  - **Fill gaps with AI** → invokes `enrich-lead` for current lead, shows toast, refreshes lead on success
- When `dossier.pct ≥ 60`, chip stays a simple button (current behavior).
- No new edge function needed — reuses `enrich-lead`.

## Files touched

- `src/components/PipelineFilters.tsx` — Dossier <50% chip
- `src/components/Pipeline.tsx` — wire `dossierGap` filter into list
- `src/components/lead-panel/LeadPanelHeader.tsx` — dropdown when <60%
- One invocation of `backfill-buyer-dossier` (no code change)

## Trade-offs

- **Win:** Reps get a one-click triage queue ("show me low-dossier leads") and a one-click in-context fix ("fill the gaps"). Closes the see-gap → fix-gap loop without leaving the lead panel.
- **Cost:** Each "Fill gaps with AI" click ≈ $0.01 (one `enrich-lead` invocation). Rep-triggered, opt-in.
- **Loss:** Header chip behavior bifurcates (button vs dropdown) by completeness threshold. **Mitigation:** caret indicator only when dropdown mode.

## Verification

1. Open SourceCo Pipeline → see "Dossier <50%" chip → click → list narrows to incomplete SourceCo leads.
2. Open one of those leads → header shows Dossier % with caret → click → dropdown shows "Jump to first empty row" + "Fill gaps with AI".
3. Click "Fill gaps with AI" → toast → after enrichment completes, several Sparkles rows appear.

