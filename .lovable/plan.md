

# Inline Auto-Find Suggestions in Lead Detail Panel

## Problem
When auto-find completes for a lead, suggestions appear in a modal dialog that blocks the view. The user wants these to live persistently inside the lead detail panel — visible when you open the lead, acted on at your own pace.

## Changes

### 1. `src/components/LeadsTable.tsx` — Add auto-find suggestions to `LeadDetail`

- Import `useProcessing` and pull `leadJobs`, `acceptLeadSuggestion`, `dismissLeadSuggestion`, `acceptAllLeadSuggestions`, `dismissLeadJob` from the context.
- In the `LeadDetail` component, check if there's a `leadJobs[lead.id]` with pending suggestions.
- If so, render an inline panel (styled similarly to `AISuggestionsPanel`) right below the enrichment section, showing the auto-find suggestions with accept/dismiss buttons per field, plus "Accept All" / "Skip All" actions.
- Also show a searching indicator if `leadJobs[lead.id]?.searching` is true.

### 2. `src/components/GlobalProcessingOverlay.tsx` — Remove individual lead modals

- Remove the `pendingLeadJobs.map(...)` dialog section (lines 162-204). These suggestions will now live in the lead detail panel.
- Keep the floating progress bar for searching leads (the spinner that says "Searching for X...").
- Keep the bulk review and bulk done modals as-is (those handle multiple leads at once and make sense as modals).

### Visual Layout

The new inline section appears between Enrichment and Contact sections:

```text
┌─────────────────────────────────────┐
│ External Research                   │
│ (collapsible sub-sections)          │
├─────────────────────────────────────┤
│ ⚡ Meeting-Based Suggestions (3)    │
│                                     │
│  Stage: Qualified → Meeting Held    │
│  "Discussed pricing in detail" [✓][✗]│
│                                     │
│  Owner: — → Malik                   │
│  "Led the call and..." [✓][✗]       │
│                                     │
│  [Skip All]  [Accept All (3)]       │
└─────────────────────────────────────┘
```

