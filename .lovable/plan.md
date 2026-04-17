

## Move right-rail clutter into the middle panel — Deal Health stays

### Current redundancy
Right rail has 7 cards. **Email Activity** duplicates the Emails tab. **Win Strategy / Risks / Open Commitments / Deal Narrative / Similar Won Deals** all duplicate (often more deeply) what's already in the **Intelligence** tab. **Company Activity** has no home — yet it's contextual to the deal.

The user wants: keep **Deal Health** in the right rail; move everything else into the middle-panel tabs without duplication.

### Target architecture

**Right rail (slimmed down to 2 cards)**
1. **Deal Health** — score, momentum, sentiment trajectory, coverage label (kept as-is — the at-a-glance status).
2. **Forecast** — already there, keep (rep-entry surface).

That's it. Right rail becomes a focused "status & forecast" stack instead of an intelligence dump.

**Middle-panel tab restructure**

| Tab | Today | After |
|---|---|---|
| Activity | Timeline + stakeholders | Timeline + stakeholders + **Company Activity** (other leads at the same company, shared intelligence) |
| Actions | Action queue | + **Open Commitments** promoted to top section ("What we owe — N items") so reps see promises before tasks |
| Meetings | Meetings list | unchanged |
| Emails | Emails list/compose | unchanged (right-rail Email Activity card removed — info already lives here) |
| Intelligence | DealIntelligencePanel (huge) | + **Win Strategy hero stays at top** + **Deal Narrative** stays + add a **"Similar Won Deals"** sub-section (currently right-rail only) at the bottom of the Intelligence tab as comparable-deal context. Risks already exist in this panel's "Risks" tab — no change. |
| Files / Notes / Debrief | unchanged | unchanged |

### Concrete component moves

1. **Delete from `LeadPanelRightRail.tsx`:**
   - `EmailActivityCard` (entire local component + `EmailMetricsCard` import)
   - `CompanyActivityCard` (entire local component) → moved
   - The `<RightRailCards>` render → replaced with a slimmer version

2. **Slim `RightRailCards.tsx`:** keep only the Deal Health card. Remove Open Commitments, Risks, Win Strategy, Similar Won Deals, Deal Narrative renders (the data is preserved — these blocks already exist in Intelligence tab/will be moved). Rename/refactor to `DealHealthCard.tsx` for clarity, or leave file and gut it.

3. **Move `CompanyActivityCard` → `src/components/lead-panel/cards/CompanyActivityCard.tsx`** (relocated), render it at the **bottom of `LeadActivityTab.tsx`** below the `UnifiedTimeline`, above the existing StakeholderCard block. Keeps "who else is involved" context in the activity narrative, where it belongs.

4. **Open Commitments → top of `LeadActionsTab.tsx`.** Add a compact "Open Commitments" header section above the current action queue using the existing `getDroppedPromises(lead)` helper from `dealHealthUtils`. Reps complete commitments inline (mark done → write to `lead_drafts`/notes or just check off — keeping behavior minimal: display + "Mark resolved" button that appends to notes).

5. **Similar Won Deals → bottom of Intelligence tab.** Inside `LeadDetailPanel.tsx`'s `<TabsContent value="intelligence">`, after `<DealIntelligencePanel>`, render a new compact `<SimilarWonDealsSection lead={lead} allLeads={leads} />` reusing `findSimilarWonDeals` from `dealHealthUtils`.

6. **Right-rail width**: reduce from `w-[320px]` to `w-[280px]` since it now holds only 2 cards. Optional but cleaner.

### Files touched

- `src/components/lead-panel/LeadPanelRightRail.tsx` — gut to render only ForecastCard + a new compact DealHealthCard. Drop `EmailActivityCard` + `CompanyActivityCard` + `<RightRailCards>` import.
- `src/components/dealroom/RightRailCards.tsx` — slim to render **only** Deal Health (or extract Deal Health into a dedicated file and delete this).
- `src/components/lead-panel/cards/CompanyActivityCard.tsx` — **new** (relocated logic).
- `src/components/lead-panel/LeadActivityTab.tsx` — render `<CompanyActivityCard>` after `UnifiedTimeline`.
- `src/components/lead-panel/LeadActionsTab.tsx` — add an "Open Commitments" section at the top.
- `src/components/LeadDetailPanel.tsx` — append `<SimilarWonDealsSection>` inside Intelligence TabsContent. Optionally tighten right-rail width.
- `src/components/lead-panel/cards/SimilarWonDealsSection.tsx` — **new**, inline-styled list (4-5 deals, won tactic, value).

### Behavior verification
1. Open any lead → right rail shows just **Deal Health + Forecast** (and Source/Engagement is on the left, unchanged).
2. **Activity tab** shows Company Activity card below the timeline when there are sibling contacts.
3. **Actions tab** shows "Open Commitments" at the top when `getDroppedPromises` returns rows.
4. **Emails tab** is the only place email metrics appear.
5. **Intelligence tab** ends with a "Similar Won Deals" section.
6. No duplication: Win Strategy / Deal Narrative / Risks / Stakeholders only appear inside Intelligence tab; Email metrics only on Emails tab.

### Trade-offs
- **Win:** Right rail goes from 7 cards to 2 → way less scroll, Deal Health pops. No duplication. Each piece of intel lives in exactly one logical tab.
- **Risk:** Power users who relied on right-rail glance for Win Strategy / Risks now click Intelligence. Acceptable — the Intelligence tab is the source of truth and Deal Health (still in right rail) signals when to open it.
- **Loss:** None — all data preserved, just relocated.

