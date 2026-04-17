

## End-to-end audit results

### What's working ✓
1. **Right rail** correctly renamed to "Signals", AI Insights + Stakeholder removed.
2. **Stakeholders** moved to bottom of Activity tab.
3. **Intelligence tab** has AI Research section + buttons + EnrichmentSection + DealIntelligencePanel.
4. **Form-tier inference works for**: `role` → Firm Type (104/104 leads have role), `current_sourcing` → Competing against (75 leads), `target_criteria` → Sector (104 leads), `acquisition_strategy` (65 leads).

### What's broken ✗ (verified against live DB)

**1. Form field values don't match parser keywords.** The form actually sends:
```
acquisition_strategy values seen in DB:
  "We're actively sourcing targets"   ← parser expects "actively sourcing" ✓ works
  "We're under LOI"                    ← parser expects "under loi" ✓ works
  "We're exploring options"            ← parser expects "exploring" ✓ works
  "We're mid-process on 1–2 deals"    ← NOT MATCHED → no timeline derived
```
So timeline is empty for all "mid-process" leads (a common picklist value).

**2. `current_sourcing` is being stored as the literal string `"false"`** for ~30 leads — Zapier sends a boolean when the field is unanswered, ingest writes it raw, and `parseCompetingFromSourcing` then returns `"false"` as the value. The dossier shows "Competing against: false" — actively wrong.

**3. EBITDA backfill never happened.** `has_ebitda = 0` across all 104 SourceCo leads despite messages like *"Target profile is EBITDA between $1-5M"* and *"Minimum SDE is 750 K"* in plain text. The backfill migration ran but the regex didn't catch these phrasings (specifically `"Minimum SDE is 750 K"` has a space before `K`, and `"EBITDA between $1-5M"` is a clean match the regex SHOULD hit but the migration must have failed silently).

**4. Geography backfill mostly empty** — only 21/104. Messages like *"primarily located in the midwestern US"* should match but aren't being parsed (regex returns full sentence with leading text).

**5. "Other" role values bypass firm type inference.** ~10 SourceCo leads picked "Other" → buyer_type stays empty → Firm Type row reads "—" with no fallback.

**6. Date formatting in "Last refreshed"** — using `new Date(researchedAt).toLocaleDateString()` but `researchedAt` may be undefined on legacy enrichment objects, showing "Invalid Date".

### What's missing for max-intuitive workflow

**A. No "Why this value?" tooltip on Sparkles glyphs** — rep can't tell if the value came from the message, a transcript, or AI research. Trust gap.

**B. No write-through on confirm.** Clicking a Sparkles-derived value doesn't promote it to a manual override unless rep retypes. They should be able to one-click "Confirm" to lock the AI value in.

**C. Mutual Plan card is below Sales Process** but the screenshot shows the natural flow is Buyer → Mandate → Process → Mutual Plan. Currently correct, but the **Decision Blocker / Stall Reason** rows in Sales Process are blank for any lead without `dealIntelligence` — and we never show the underlying form-tier signal that says the prospect picked "We're exploring options" (low intent). That's a blocker signal we have but don't surface.

**D. `dealsPlanned` field is unused.** SourceCo form asks "How many acquisitions are you planning?" → stored on lead but never rendered. Belongs in M&A Mandate as "Deals planned".

**E. `acquisition_strategy` raw value is shown nowhere.** It's used to *derive* timeline but the rep can never see "Buyer self-identified as: We're under LOI" — that's the strongest intent signal we get from the form.

**F. No dossier completeness indicator.** Rep opens a lead and can't tell if the dossier is 80% AI-filled vs. 20% — affects trust.

## Plan

### Phase 1 — Fix the data layer (highest leverage)

1. **Fix `current_sourcing = "false"` bug** in `ingest-lead/index.ts`: when the value is a boolean, an empty array, or the literal string `"false"`, store empty string instead. One-shot UPDATE migration to clean up the 30 affected rows.

2. **Expand `parseTimelineFromStrategy`** in `submissionParser.ts`:
   - `"mid-process"` / `"in process"` / `"1-2 deals"` → `"0-3 months"`
   - Re-run the timeline backfill.

3. **Fix EBITDA + Geography backfill failure.** Replace the SQL-side regex (which fails on edge cases) with a one-shot edge-function backfill that runs the JS `submissionParser.ts` over each row in batches. Then `has_ebitda` and `has_geo` should jump from 0/21 → ~70+.

4. **Add a fourth tier for Firm Type when `role = "Other"`**: scan the message for firm-type keywords (`"family office"`, `"PE"`, `"search fund"`, `"holdco"`) and use that. Backfill.

### Phase 2 — Surface the data we already have

5. **Show `acquisitionStrategy` raw value as a row in M&A Mandate** labeled "Self-stated stage" (read-only, with the form's exact picklist value). This is the prospect's own words — never overwrite it with a derived timeline.

6. **Render `dealsPlanned`** as a row in M&A Mandate ("Deals planned per year").

7. **Add Stall Reason form-tier fallback**: if `acquisition_strategy = "We're exploring options"` AND no momentum data, surface "Self-identified as exploring (low urgency)" as the Stall reason derived value.

### Phase 3 — Trust + speed UX

8. **Sparkles tooltip**: hover any Sparkles glyph → tooltip shows "Inferred from: form submission" / "Inferred from: meeting on Mar 12" / "Inferred from: AI research of acme.com". Reuses the `DerivedValue.source` field already on every helper.

9. **One-click confirm**: tiny check button next to Sparkles → writes the derived value to the manual column, clears Sparkles, logs an activity entry. Zero typing.

10. **Dossier completeness chip** in lead panel header: "Dossier 64%" — counts populated rows (manual OR derived) across Buyer Profile + M&A Mandate + Sales Process. Click → scrolls to first empty row.

11. **Fix "Last refreshed Invalid Date"** — fall back to `enrichment.fetchedAt`, then to "—".

### Phase 4 — Reorder for natural reading

12. Buyer Profile rows reorder: Firm type → Firm AUM → **Self-stated stage (NEW)** → Acq. timeline → Active searches → Stakeholders → Champion → Budget → Authority. The self-stated stage is the strongest signal and should sit near the top.

## Files touched

- `supabase/functions/ingest-lead/index.ts` — sanitize `current_sourcing` boolean
- `supabase/functions/backfill-buyer-dossier/index.ts` — **new**, runs JS parsers over existing rows
- `src/lib/submissionParser.ts` — add "mid-process" timeline mapping, expand firm-type from message
- `src/lib/dealDossier.ts` — add `deriveStallReasonFromSubmission`, expose `source` for tooltips
- `src/components/lead-panel/cards/BuyerProfileCard.tsx` — reorder rows, render Self-stated stage
- `src/components/lead-panel/cards/MAMandateCard.tsx` — render `dealsPlanned` row
- `src/components/lead-panel/cards/SalesProcessCard.tsx` — wire submission-tier stall fallback
- `src/components/lead-panel/InlineEditFields.tsx` (or new `HybridField.tsx`) — Sparkles tooltip + one-click confirm
- `src/components/lead-panel/LeadPanelHeader.tsx` — Dossier completeness chip
- `src/components/lead-panel/AIResearchSection.tsx` — date fallback
- One SQL migration — `UPDATE leads SET current_sourcing='' WHERE current_sourcing IN ('false','true','[]')`

## Trade-offs

- **Win:** Every existing lead's dossier jumps from ~30% populated to ~75% with no AI cost (pure form/regex). Sparkles tooltip + one-click confirm closes the trust gap. Self-stated stage row surfaces the single most actionable form signal we currently throw away.
- **Cost:** `backfill-buyer-dossier` edge function call (~104 rows × 1 sync write). One-time, free.
- **Cost:** Header chip adds ~1 line of state per lead open. Negligible.
- **Loss:** Reordering means muscle memory shifts for existing users. Acceptable — current order isn't established muscle memory yet.

## Sequence

1. Fix `current_sourcing=false` ingest bug + cleanup migration.
2. Expand `submissionParser` keywords (timeline, firm type from message).
3. Build + run `backfill-buyer-dossier` edge function.
4. Render `acquisitionStrategy` (Self-stated stage) and `dealsPlanned` rows.
5. Wire submission-tier stall reason fallback.
6. Add Sparkles tooltip + one-click confirm UX.
7. Add Dossier completeness header chip.
8. You verify: open SC-T-067 → Sales Process shows "Competing against: We're exploring options" (not "false"); M&A Mandate shows EBITDA Min "$750K" (parsed from "Minimum SDE is 750 K"); hover any Sparkles glyph → tooltip names the source; click the check → row promotes to manual; header shows "Dossier ~75%".

