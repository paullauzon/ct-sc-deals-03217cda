

# Add "Pending Suggestions" Indicator to Pipeline Deal Cards

## What
After auto-processing completes, leads with pending suggestions to review will show a small visual indicator on their pipeline deal card — a sparkle icon with a count badge, signaling the user should open the panel to review suggestions.

## How

### 1. Import `useProcessing` in Pipeline.tsx
Access `leadJobs` from `ProcessingContext` to check which leads have pending suggestions.

### 2. Add indicator to deal cards (around line 248, after the intelligence indicators block)
For each lead, check if `leadJobs[lead.id]` exists:
- If `searching: true` → show a small spinning/pulsing indicator ("Processing…")
- If `pendingSuggestions.length > 0` → show a sparkle icon with count badge (e.g., `✨ 3 to review`) in a highlighted style

The indicator will be a small row at the bottom of the card, styled distinctly (e.g., amber/yellow background) so it stands out.

### Files Changed
- `src/components/Pipeline.tsx` — import `useProcessing`, add indicator UI inside deal card

