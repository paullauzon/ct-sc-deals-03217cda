

## End-to-end audit findings

### Real DB coverage (104 SourceCo, non-empty + non-garbage)
```
buyer_type           82/104  ← OK (22 are role="Other")
target_criteria     104/104  ← INFLATED (includes "Use your tool", "Deal sourcing")
geography            29/104  ← form-tier ceiling
ebitda_min/max       24/104  ← form-tier ceiling
target_revenue       29/104  ← form-tier ceiling
firm_aum              0/104  ← AI tier never wrote
acq_timeline          0/104  ← AI tier never wrote
active_searches       0/104  ← AI tier never wrote
authority_confirmed   0/104  ← transcript tier needs meetings
budget_confirmed      0/104  ← transcript tier needs meetings
deal_type             0/104  ← AI tier never wrote
transaction_type      0/104  ← AI tier never wrote
competing_against     0/104  ← transcript tier needs meetings
decision_blocker      0/104  ← transcript tier needs meetings
stall_reason          0/104  ← transcript tier needs meetings
```

### Diagnosis

| Gap | Root cause | Fix |
|---|---|---|
| AI-tier rows (firm_aum, acq_timeline, deal_type, txn_type, active_searches) are 0% in DB | `enrich-lead` rarely returns `buyerProfileSuggested`, and when it does it's not auto-persisted | Make `enrich-lead` always emit `buyerProfileSuggested` from the form data + LinkedIn snippet, and **auto-persist** the values into the manual columns when they're empty (high-confidence only) |
| Per-row Confirm UX exists but nobody runs it across 104 leads | One-by-one promotion = friction | Add **"Auto-confirm all SourceCo dossiers"** Pipeline action (one click → walk every active SC lead, promote the unambiguous derived values into manual columns + log a single combined activity per lead) |
| `target_criteria` includes garbage like `"Use your tool"`, `"Deal sourcing"` (3-word filler from form) | Parser fallback uses first sentence with no quality gate | Reject submissions with <20 chars OR fewer than 3 distinct words OR matching a low-signal denylist (`use your tool`, `deal sourcing`, `Source for ...`) |
| Authority / budget / decision blocker / stall reason all 0% | These come from meeting transcripts — most SC leads have none yet | Surface "Awaiting first meeting" placeholder in the dossier rows that need transcripts, so the rep knows the gap is structural, not a bug |
| Reference screenshot shows "Active searches: 2", "Authority confirmed: Yes — committee", clean monochrome rendering | Today's UI already has these rows, but they show "—" because the AI/transcript layers are empty | Once auto-persist + auto-confirm land, the panel will populate. Also: tighten cell formatting (right-align values, lighter divider, bold value tone) to match screenshot density |

### What's actually missing vs. screenshot

The reference layout is **already implemented row-for-row** in the three cards (Buyer Profile / M&A Mandate / Sales Process). The visual difference today is:
1. Most rows render `—` because the data isn't persisted (root cause above)
2. Card title style: screenshot uses small-caps "BUYER PROFILE" with a subtle ▲ collapse glyph — current uses sentence case + chevron
3. Two-column row with right-aligned value (current rows already do this — pure data issue)

## Plan

### Phase 1 — Fix the data layer (drives everything else)

**1.1 Upgrade `enrich-lead` to always emit a usable `buyerProfileSuggested`**
- Pass the form payload (role, message, currentSourcing, acquisitionStrategy, dealsPlanned) into the AI prompt explicitly
- Force JSON output with `firmAum`, `acqTimeline`, `activeSearches`, `dealType`, `transactionType` keys (empty string if low-confidence)
- For `acqTimeline`, deterministically map `acquisitionStrategy` first (no AI call needed for that one)

**1.2 Auto-persist high-confidence AI suggestions**
- Inside `enrich-lead`, after generating `buyerProfileSuggested`, write to the manual column **only** when the manual column is currently empty AND the suggestion is non-empty + non-placeholder
- Log a single activity entry: `Auto-promoted 4 AI dossier values: Firm AUM, Acq. timeline, Deal type, Transaction type`

**1.3 Add `bulk-promote-dossier` edge function (no AI)**
- Walks every active SourceCo lead
- For each, runs the existing JS parsers (`submissionParser.ts`) and writes to manual columns when empty
- Idempotent — safe to re-run after parser updates
- Returns counts: `{ scanned: 104, promoted: 87, fields_written: 312 }`

**1.4 Sanitize `target_criteria` denylist**
- In `parseSectorFromText`, reject results matching `/^(use your tool|deal sourcing|source for|tbd|n\/?a|test)$/i` and length <20
- Run a one-off SQL migration to nullify `target_criteria` rows matching the denylist

### Phase 2 — Pipeline-level orchestration

**2.1 Replace "Re-enrich top 20" button with a 2-step menu**
- "Promote parsed values now" → calls `bulk-promote-dossier` (instant, free)
- "Re-enrich with AI (top 20)" → existing `bulk-enrich-sourceco` (AI, costs $)
- Both show toast with counts written

### Phase 3 — UX polish to match screenshot

**3.1 Card title styling**
- Update `CollapsibleCard` to render dossier card titles as `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` to match the screenshot's "BUYER PROFILE" treatment
- Replace chevron with ▲/▼ glyphs only on the three dossier cards (preserve existing style elsewhere)

**3.2 "Awaiting transcript" placeholder for transcript-only rows**
- For `Stakeholders`, `Champion`, `Budget confirmed`, `Authority confirmed`, `Decision blocker`, `Stall reason`: when the lead has zero meetings AND no manual value, render a muted "Awaiting first meeting" hint instead of "—"

## Files touched

- `supabase/functions/enrich-lead/index.ts` — always emit `buyerProfileSuggested` from form payload; auto-persist empty manual columns; deterministic acqTimeline mapping
- `supabase/functions/bulk-promote-dossier/index.ts` — NEW; runs parsers across all SC leads, writes empty columns
- `src/lib/submissionParser.ts` — denylist + length gate in `parseSectorFromText`
- One SQL migration — nullify garbage `target_criteria` rows
- `src/components/Pipeline.tsx` — replace single button with a 2-action dropdown
- `src/components/dealroom/CollapsibleCard.tsx` — small-caps title variant
- `src/components/lead-panel/HybridField.tsx` — `awaitingMeeting` prop renders subtle placeholder
- `src/components/lead-panel/cards/BuyerProfileCard.tsx` + `SalesProcessCard.tsx` — pass `awaitingMeeting={!lead.meetings?.length}` to transcript-only rows

## Trade-offs

- **Win:** DB coverage on the critical 5 AI-tier rows lifts from 0% → ~70% across 104 leads in one click ($2 of AI). Form-tier coverage lifts to ~90% via deterministic parsers (free). Reps see real values, not dashes. Pipeline filters become meaningful.
- **Cost:** `bulk-enrich-sourceco` will need its 20-lead cap raised to 104 once the auto-persist is in place — adds ~$2 one-time spend.
- **Risk:** Auto-persisting AI values bypasses the rep's confirmation. **Mitigation:** only writes when manual is empty (never overwrites), logs every write, Sparkles glyph still renders so the rep can see the AI origin and override.
- **Loss:** The "Confirm AI" button becomes mostly redundant for the AI tier. **Mitigation:** keep it for the transcript tier, where rep judgment matters more.

## Verification

1. Run `bulk-promote-dossier` → DB coverage on `buyer_type/geography/ebitda/revenue` jumps to ~90%.
2. Run upgraded `bulk-enrich-sourceco` (now 104 cap) → DB coverage on `firm_aum/acq_timeline/active_searches/deal_type/txn_type` jumps from 0% → ~70%.
3. Open `SC-T-067` (Imari Sallins) → all 9 Buyer Profile rows + all 9 M&A Mandate rows show real values; dossier chip reads ~80%.
4. Open `SC-I-040` (Arun Karthik) → `target_criteria` row no longer shows "Use your tool" garbage.
5. Pipeline header shows 2-action dropdown; clicking "Promote parsed values now" produces toast `Promoted 87 leads · 312 fields written`.
6. Card titles render as small-caps "BUYER PROFILE" matching the screenshot.

