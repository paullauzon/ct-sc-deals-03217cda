---
name: Buyer Dossier System
description: Manual→AI→submission→transcript fallback chain for Buyer Profile / M&A Mandate / Sales Process cards. Click ✓ to promote AI value to manual.
type: feature
---
The Buyer Dossier (Buyer Profile + M&A Mandate + Sales Process cards in the SourceCo lead panel left rail) uses a 4-tier fallback chain to populate every row:

1. **Manual** — user-typed value in DB column (e.g. `lead.buyerType`). Wins if set.
2. **AI research** — populated by `enrich-lead` into `enrichment.buyerProfileSuggested.*` (firmAum, ebitdaMin/Max, dealType, etc.).
3. **Form submission (regex)** — `src/lib/submissionParser.ts` parses `role`, `acquisitionStrategy`, `currentSourcing`, `targetCriteria`, plus regex over the freeform `message` for EBITDA / revenue / geography.
4. **Meeting transcript** — `dealIntelligence.stakeholderMap`, `momentumSignals`, `riskRegister` extracted by `process-meeting`.

UI primitives:
- `HybridText` / `HybridSelect` (`src/components/lead-panel/HybridField.tsx`) — manual ⊕ derived row with Sparkles glyph + tooltip + ✓ Confirm button.
- `DerivedRow` — read-only derived (Stakeholders, Champion).
- `data-dossier-row="<key>" data-dossier-filled="true|false"` — every row tagged so the Dossier % chip in `LeadPanelHeader` can dispatch `scroll-to-empty-dossier` and the rail listener scrolls to + flashes the first empty row.

Confirm-click writes to the manual DB column AND fires `logActivity(leadId, "field_update", "Confirmed AI value for ...")` for an audit trail.

Completeness % from `computeDossierCompleteness(lead)` in `src/lib/dealDossier.ts` — counts populated rows (manual OR derived) across both card sets, brand-aware (SourceCo gets full set, Captarget gets lean subset).

Backfill: `supabase/functions/backfill-buyer-dossier/index.ts` runs the JS parsers over historical rows. `bulk-enrich-sourceco/index.ts` re-runs `enrich-lead` against the top 20 active SourceCo leads (button in Pipeline header when SourceCo leads exist).
