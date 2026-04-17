

## Goal

Continue executing the audit's remaining items: invoke the new backfill function to fix EBITDA/Geography on existing leads, make the Dossier % chip clickable to scroll to the first empty row, audit-log Confirm clicks, and add a one-click "Bulk re-enrich top SourceCo leads" trigger.

## What's left from the audit

| Item | Status |
|---|---|
| Sanitize `current_sourcing="false"` at ingest | done last loop |
| Expand timeline / firm-type parsers | done |
| Sparkles tooltip + ✓ Confirm | done (HybridField.tsx) |
| Self-stated stage row | done |
| Dossier % chip | done (static) |
| Date "Invalid Date" fix | done |
| **Run `backfill-buyer-dossier`** | **pending** |
| **Make Dossier chip clickable → scroll to first empty row** | **pending** |
| **Audit-log Confirm-click** | **pending** |
| **Bulk re-enrich SourceCo top leads** | **pending** |

## Plan

### 1. Invoke `backfill-buyer-dossier` (one-shot)
Hit the deployed function. Should fix `ebitda_min/max`, `geography`, `target_revenue`, `target_criteria`, `buyer_type` for the ~80 SourceCo leads where SQL regex missed. Print before/after counts. Pure data, no code change.

### 2. Make Dossier % chip actionable
- `LeadPanelHeader.tsx`: chip becomes a `<button>` that emits a `scroll-to-empty-dossier` custom event with the lead id.
- `LeadPanelLeftRail.tsx`: listens, walks dossier card refs in priority order (Buyer → Mandate → Process), finds first row with no manual + no derived value, scrolls it into view + flashes a 1-second ring highlight.
- Each `Hybrid*` row gets a stable `data-dossier-row="<field>"` attribute so the scroller can target it.

### 3. Audit-log on Confirm
- Extend `HybridField.DerivedAffordance` to accept an optional `onConfirm` callback that already fires `onSave(derived.value)`. Wrap the cards' `save()` calls so when invoked via Confirm, they also call `logActivity(leadId, "field_update", \`Confirmed AI value for <label>: "<value>" (source: <source>)\`, "", value)`.
- Cleanest: add an optional second arg `meta?: { confirmed?: boolean; source?: string; label?: string }` to `HybridText`/`HybridSelect`'s `onSave`, and let cards branch on it. Tiny diff.

### 4. Bulk re-enrich top SourceCo leads
- New tiny edge function `bulk-enrich-sourceco/index.ts`: pulls top 20 active SourceCo leads (not archived, not closed lost, ordered by `tier` then `created_at desc`), invokes `enrich-lead` per lead with a 500 ms stagger. Returns counts.
- One-click button in the **Pipeline header** when `system === "sourceco"`: "Re-enrich top 20" → calls function → toast with results. Reuses `GlobalProcessingOverlay` patterns; no new UI primitives.

### 5. Memory update
Append a single `mem://features/buyer-dossier-system` line to `mem://index.md` describing the manual→AI→submission→transcript fallback chain so future loops respect the architecture.

## Files touched

- `src/components/lead-panel/LeadPanelHeader.tsx` — chip → button + event dispatch
- `src/components/lead-panel/LeadPanelLeftRail.tsx` — event listener + scroll/flash
- `src/components/lead-panel/HybridField.tsx` — pass `meta.confirmed` through `onSave`
- `src/components/lead-panel/cards/{BuyerProfile,MAMandate,SalesProcess}Card.tsx` — add `data-dossier-row` + activity log on confirm
- `src/components/Pipeline.tsx` (or its header) — "Re-enrich top 20" button (SourceCo only)
- `supabase/functions/bulk-enrich-sourceco/index.ts` — **new**
- `mem://features/buyer-dossier-system.md` + `mem://index.md` — memory entry

## Trade-offs

- **Win:** Backfill turns 0/104 EBITDA + 21/104 geography into ~70+/104 instantly. Clickable chip closes the "where's the gap?" loop. Confirm-logging gives an audit trail of which AI values were trusted vs. overridden.
- **Cost:** Bulk re-enrich = 20 OpenAI calls (~$0.20). One-click, rep-triggered, opt-in.
- **Loss:** Activity log entries for every Confirm click could noise up timelines. **Mitigation:** description prefixed `Confirmed AI value` so it's easy to filter.

## Sequence

1. Invoke `backfill-buyer-dossier` and report counts.
2. Make Dossier chip clickable + add row-scroller logic.
3. Wire Confirm → activity log via `meta.confirmed` plumb-through.
4. Build + deploy `bulk-enrich-sourceco` + add Pipeline button.
5. Update memory.
6. You verify: open SC-T-067 → EBITDA/geography populated; click Dossier % chip → scrolls + flashes first empty row; click ✓ on a Sparkles row → activity log shows "Confirmed AI value …"; on SourceCo Pipeline header click "Re-enrich top 20" → toast confirms.

