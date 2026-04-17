

## What's actually broken (root cause)

Looking at live SourceCo submission JSON:

```
buyerType:           ""                 ← form field is empty (Zapier/Webflow not mapping it)
role:                "Family Office"    ← THE FIRM TYPE IS HERE!
                     "Private Equity"
                     "Individual Investor"
                     "Business Owner"
                     "Corporate"
acquisitionStrategy: "We're under LOI"  ← timeline / stage signal
                     "We're actively sourcing targets"
currentSourcing:     "Internal BD team" ← this IS "Competing against"
                     "Manual outreach (Grata, Pitchbook…)"
message:             "EBITDA between $1-5M, midwestern US, water treatment"
                     ← targetRevenue/geography/sector buried here, never extracted
hearAboutUs:         "LinkedIn"         ← attribution, already shown
targetRevenue:       ""                 ← never sent by form
geography:           ""                 ← never sent by form
```

So the dossier reads as empty because **`BuyerProfileCard` only checks `lead.buyerType`** — which the form never populates — instead of `lead.role` (where the firm type actually lives) and the message text. And the `enrich-lead` `buyerProfileSuggested` block was added but no historical lead has been re-enriched, so it's null on every existing record.

## Plan

### 1. Map the form fields we already receive — three-tier fallback

Update `dealDossier.ts` derivation helpers + `BuyerProfileCard`/`MAMandateCard`/`SalesProcessCard` to read in this priority order for every field:

```
manual override → AI suggestion → form-submission inference → transcript inference → ""
```

Concretely:

| Card field | New source order |
|---|---|
| Firm type | `lead.buyerType` → **`lead.role`** (normalized: "Family Office", "Private Equity"→"PE Firm", "Individual Investor"→"HNWI", "Business Owner"→"Strategic / Corporate", "Corporate"→"Strategic / Corporate") → AI |
| Acq. timeline | `lead.acqTimeline` → **`lead.acquisitionStrategy`** ("under LOI"→"0-3 months", "actively sourcing"→"3-6 months", "exploring"→"6-12 months") → meeting timeline → AI |
| Active searches | manual → **regex on `message` + `dealsPlanned`** ("2-3 acquisitions per year", "2 active mandates") → AI |
| Target sector(s) | `lead.targetCriteria` → **first sentence/clause of `message`** (e.g. "industrial and residential water treatment service providers") → AI |
| Target geography | `lead.geography` → **regex on `message`** ("Southern Ontario", "midwestern US", "Southeast") → AI |
| EBITDA min/max | manual → **regex on `message`** (`$1-5M`, `<$1M ebitda`, `Minimum SDE is 750K`) → AI |
| Revenue range | `lead.targetRevenue` → **regex on `message`** (`$10-100M in revenue`) → AI |
| Competing against | manual → `competingBankers` → **`lead.currentSourcing`** ("Internal BD team", "Manual outreach (Grata, Pitchbook, LinkedIn)") → transcript |

A single new helper `src/lib/submissionParser.ts` exposes pure functions: `parseFirmTypeFromRole(role)`, `parseTimelineFromStrategy(s)`, `parseEbitdaFromText(s)`, `parseRevenueFromText(s)`, `parseGeographyFromText(s)`, `parseSectorFromText(s)`, `parseActiveSearchesFromText(s)`. These are deterministic regex/keyword matchers — no AI call, no async — so the dossier auto-fills the moment you open any lead, not just enriched ones.

`dealDossier.ts` derivation helpers chain these into `DerivedValue` with `source: "submission"`. The Sparkles glyph stays — the rep sees the field is auto-filled and one-clicks to override.

### 2. Fix the ingestion gap — backfill the columns too

Update `ingest-lead/index.ts` to write the parsed values into the actual DB columns at submit time, so even the pipeline list/filters benefit (not just the Deal Room card):

- `buyer_type` ← `parseFirmTypeFromRole(role)` if `body.buyerType` is empty
- `target_revenue`, `geography`, `target_criteria` ← parsed from `message` if blank

This is non-destructive (only fills empties) and immediately makes every new lead arrive with a populated dossier.

### 3. One-shot DB backfill for the 60+ existing SourceCo leads

Single migration runs the same parsers in SQL (or in a one-shot script) over existing rows where the destination column is blank. Same logic as ingest, applied retroactively. After this, every historical lead has a populated Buyer Profile / M&A Mandate without needing a re-enrichment.

### 4. Re-trigger `enrich-lead` for top-priority SourceCo leads

The `buyerProfileSuggested` AI block is wired but no lead has it because the schema landed after the last enrichment. We don't auto-bulk-enrich (cost), but the existing "Re-run Research" button in the Intelligence tab now actually fills the AI-derived rows. Add a one-line note in the AI Research section: "AI fills Firm AUM, EBITDA range, and Deal Type when sources are available — click Research."

### 5. Tighten the card render so empty-with-AI-fallback shows the value

Current `HybridText` renders the AI-derived value BUT `BuyerProfileCard` passes `lead.buyerType` (always `""` truthy-empty) to a plain `InlineSelectField`, bypassing the hybrid path. Refactor Firm type to use `HybridSelect` with the new `parseFirmTypeFromRole` derived value — same fix pattern for the other three cards.

## Files touched

- `src/lib/submissionParser.ts` — **new**, ~120 lines of pure regex/keyword parsers.
- `src/lib/dealDossier.ts` — extend each `derive*` helper to chain submission-parser fallback before AI suggestion.
- `src/components/lead-panel/cards/BuyerProfileCard.tsx` — Firm type uses `HybridSelect`; all rows use the chained derivation.
- `src/components/lead-panel/cards/MAMandateCard.tsx` — Target sector / geography / EBITDA / revenue rows wrap in `HybridText` with submission-parser fallback.
- `src/components/lead-panel/cards/SalesProcessCard.tsx` — `Competing against` reads `currentSourcing` as a derived fallback.
- `supabase/functions/ingest-lead/index.ts` — fill `buyer_type` / `target_revenue` / `geography` / `target_criteria` from parsers when blank at insert.
- `supabase/migrations/<new>.sql` — one-shot UPDATE to backfill those four columns on existing rows where they're blank using PostgreSQL regex (or call a SECURITY DEFINER function that does the same thing).

## Trade-offs

- **Win:** Every existing and future SourceCo lead's Buyer Profile / M&A Mandate / Sales Process auto-fills from data we already have. No re-enrichment needed for the structured fields. Sparkles glyph keeps the "AI-derived, click to override" affordance consistent.
- **Win:** Mapping `role` → firm type fixes the user's specific complaint ("Firm type — they always pick their firm type") because the form sends it under `role`, not `buyerType`.
- **Cost:** Regex parsers are heuristic — they'll miss edge phrasings ("ARR of $5MM", "EU only"). **Mitigation:** chained fallback (manual → submission-parse → AI) means the AI catches what regex misses; user override is one click.
- **Cost:** Backfill migration touches every SourceCo row once. Acceptable: nullable columns, no destructive writes.

## Sequence

1. Build `submissionParser.ts` with the 7 pure parsers + unit-friendly exports.
2. Extend `dealDossier.ts` derivation helpers to chain submission-parser fallback.
3. Refactor `BuyerProfileCard` Firm type → `HybridSelect`, wire all 3 cards to the chained derivers.
4. Update `ingest-lead/index.ts` to write parsed values to DB columns at submit.
5. Migration: backfill `buyer_type` / `target_revenue` / `geography` / `target_criteria` on existing rows.
6. You verify: open any SourceCo lead → Firm type, Target sector, Geography, Revenue, EBITDA, Competing against, Acq. timeline all populated with the Sparkles glyph; click any row to override.

