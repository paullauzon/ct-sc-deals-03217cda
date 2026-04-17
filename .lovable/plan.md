

## Goal

1. Move **AI Insights** + **External Research / Research & Recommend** out of the right rail and into the **Intelligence tab** (the middle workspace), including the action buttons (Research, Re-run, Accept All, etc.).
2. Move **Stakeholders** out of the right rail to a less prominent but appropriate spot.
3. Reassess what (if anything) the right rail should still show.

## Investigation

Let me confirm the current shape of the Intelligence tab and the right rail.
<lov-tool-use id="toolu_vrtx_01EGjzYzN3XML7Ko6CcYPqtX" name="code--search_files" integration-id="code" data="{\"query\": \"Intelligence|IntelligenceTab|deal intelligence synthesized\", \"include_patterns\": \"src/components/lead-panel/**/*.tsx,src/components/dealroom/**/*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01CbWcQTQT9dKmMwjfYNZQpV" name="code--search_files" integration-id="code" data="{\"query\": \"Intelligence|deal intelligence synthesized|IntelligenceTab\", \"include_patterns\": \"src/components/lead-panel/**/*.tsx,src/components/dealroom/**/*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_0196XuYC1v3uy25ByUipsp2g" name="code--search_files" integration-id="code" data="{\"query\": \"No deal intelligence synthesized\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01DF1CERY2nTUQwnwtCdHkjX" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/LeadDetailPanel.tsx\", \"lines\": \"340-450\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_011Kz4xwvvqLogWvEoo9tSCt" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/lead-panel/LeadPanelRightRail.tsx\", \"lines\": \"75-235\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01DYyzFjtkPpsydFM22vXoGo" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/dealroom/RightRailCards.tsx\"}">
</lov-tool-use>
Now I have enough context. Let me view the Intelligence tab content and check StakeholderCard placement.
<lov-tool-use id="toolu_vrtx_019nyZeMo3tDau5eNZe9scx7" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/lead-panel/cards/StakeholderCard.tsx\", \"lines\": \"1-40\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Rb5L6PFc91UvxgzHLWjvZH" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/DealIntelligencePanel.tsx\", \"lines\": \"1-30\"}">
</lov-tool-use>
I have enough. Let me present the plan.

<lov-plan>

## Goal

Move **AI Insights** + **External Research** (Research & Recommend) out of the right rail into the **Intelligence tab** (center workspace) — including the action buttons. Then move **Stakeholders** (currently both `StakeholderCard` and the `RightRailCards` Stakeholders block) somewhere less prominent.

## What's in the right rail today

```
Intelligence (label)
├─ AI Insights              ← move to Intelligence tab
├─ Stakeholders             ← move to Activity tab footer
├─ Email Activity           ← keep
├─ Deal Health (RightRailCards) ← keep
├─ Stakeholders (RightRailCards) ← also remove (duplicate)
├─ Open Commitments         ← keep
├─ Risks                    ← keep
├─ Win Strategy             ← keep
├─ Buying Committee         ← keep
├─ Similar Won Deals        ← keep
├─ Deal Narrative           ← keep
└─ Company Activity         ← keep
```

## Plan

### 1. Intelligence tab gets a new top section

In `LeadDetailPanel.tsx` (lines 380–390), the Intelligence `TabsContent` becomes:

```
┌─ AI Research & Insights ───────────────────┐
│  [Research]  [Research & Recommend]        │  ← actions moved from right rail
│  External research scrapes the company     │
│  site & recommends CRM updates.            │
│                                             │
│  Last refreshed: <date>                    │
│  ── Suggested CRM updates (X) ─────────    │
│  <existing EnrichmentSection content>      │
│  <auto-find suggestions block>             │
└─────────────────────────────────────────────┘

┌─ Synthesized Deal Intelligence ────────────┐
│  <existing DealIntelligencePanel OR        │
│   "No deal intelligence synthesized yet"   │
│   empty state>                             │
└─────────────────────────────────────────────┘
```

Net effect: Intelligence tab shows everything AI-related in one place — research button at top, suggestions in the middle, synthesized intel below. The "No research yet · Research" + "Research & Recommend" buttons from screenshot get a proper home.

### 2. Right rail cleanup

`LeadPanelRightRail.tsx`:
- Remove `<AIInsightsCard …>` (now lives in Intelligence tab).
- Remove `<StakeholderCard lead={lead} />`.
- Header label changes from "Intelligence" → "Signals" (more accurate now: Email Activity, Deal Health, Risks, Win Strategy, etc.).

`RightRailCards.tsx`:
- Remove the "Stakeholders" `CollapsibleCard` block (lines 80–112) — duplicate of StakeholderCard, and moving stakeholders out of the right rail entirely.

### 3. Stakeholders new home: Activity tab

Stakeholders are deal context, not a primary action surface. Move `<StakeholderCard lead={lead} />` to the bottom of the **Activity tab** (`LeadActivityTab.tsx`) inside a section labeled "Stakeholders" — collapsed by default. This keeps it accessible (one click) but no longer competes with primary signals.

Rationale: Activity tab already shows the unified timeline of who-said-what, so stakeholder list is a natural companion. It also keeps `StakeholderCard` mounted only when the tab is open (small perf win).

### 4. Extract helper component

Pull the existing `AIInsightsCard` body out of `LeadPanelRightRail.tsx` into a new file `src/components/lead-panel/AIResearchSection.tsx` so it can be rendered inside the Intelligence tab without the `CollapsibleCard` wrapper (since the tab already has its own header pattern). Keeps the file clean and avoids inflating `LeadDetailPanel.tsx`.

## Files touched

- `src/components/lead-panel/AIResearchSection.tsx` — new file (extracted from `AIInsightsCard` logic, no `CollapsibleCard` wrapper, prominent action button row at top).
- `src/components/LeadDetailPanel.tsx` — Intelligence `TabsContent` renders `<AIResearchSection>` then existing intel panel/empty state.
- `src/components/lead-panel/LeadPanelRightRail.tsx` — drop `AIInsightsCard` + `StakeholderCard`; relabel header "Signals".
- `src/components/dealroom/RightRailCards.tsx` — drop the duplicate Stakeholders block.
- `src/components/lead-panel/LeadActivityTab.tsx` — append a collapsed "Stakeholders" section at the bottom.

No schema changes. ~80 lines moved.

## Trade-offs

- **Win:** Intelligence tab becomes the single AI surface. Right rail becomes a focused "live signals" dashboard (health, momentum, risks, commitments) without the heavyweight enrichment UI.
- **Win:** Removes the duplicate Stakeholders rendering (was in both `StakeholderCard` and `RightRailCards`).
- **Loss:** Research button is one extra click away (must open Intelligence tab). **Mitigation:** the Enrich button already exists in the left-rail action grid (added in the previous round) — that's the fast path. The Intelligence tab is the *deep* surface.
- **Loss:** Stakeholders less visible. **Mitigation:** champion/blocker info already surfaces in Deal Health (right rail) and Buying Committee (right rail), so the high-signal stakeholder data isn't lost from the at-a-glance view.

## Sequence

1. Create `AIResearchSection.tsx` (extract logic, prominent button row).
2. Wire it into Intelligence `TabsContent` in `LeadDetailPanel`.
3. Strip `AIInsightsCard` + `StakeholderCard` from right rail; rename label to "Signals".
4. Strip duplicate Stakeholders block from `RightRailCards`.
5. Append collapsed Stakeholders section to `LeadActivityTab`.
6. You verify: open a lead → Intelligence tab shows Research button + suggestions + synthesized intel; right rail shows Signals (no AI Insights, no Stakeholders); Activity tab footer has Stakeholders section.

