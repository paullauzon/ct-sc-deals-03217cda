

# Pipeline Card: Meeting Count + Cross-Brand Visibility

## Changes

### 1. Meeting count badge on pipeline deal cards (`src/components/Pipeline.tsx`)

Currently line 182 shows the Fireflies icon only if `lead.firefliesUrl` exists (legacy single-meeting field). Replace this with a check on `lead.meetings.length > 0` and show the count next to the Fireflies icon:

```
{lead.meetings?.length > 0 && (
  <div className="flex items-center gap-0.5">
    <img src="/fireflies-icon.svg" className="w-3.5 h-3.5" />
    <span className="text-[10px] tabular-nums font-medium">{lead.meetings.length}</span>
  </div>
)}
```

### 2. Cross-brand indicator on pipeline deal cards (`src/components/Pipeline.tsx`)

For leads that exist across both brands (SourceCo and Captarget), surface the other brand's submission info directly on the card. Currently it just says "⚑ Cross-brand duplicate". Enhance to show the other brand name so you know at a glance they came in via both channels. Also look up the duplicate lead to show its source.

Replace the current duplicate line (~line 168) with:
```
{lead.isDuplicate && (
  <p className="text-[10px] text-muted-foreground">
    ⚑ Also via {lead.brand === "Captarget" ? "SC" : "CT"}
  </p>
)}
```

### 3. Cross-brand section in lead detail panel (`src/components/LeadsTable.tsx`)

Currently the detail panel shows a one-line note about duplicates (line 83-85). Enhance this: when a lead is a cross-brand duplicate, show a small section with the other brand's submission details (source, date submitted, message excerpt) so you're fully informed without switching leads.

Add after the Contact section: a "Cross-Brand Submission" section that looks up the duplicate lead and displays its source, date, and message.

| File | Change |
|------|--------|
| `src/components/Pipeline.tsx` | Replace Fireflies icon logic with meetings count; enhance duplicate line |
| `src/components/LeadsTable.tsx` | Add cross-brand submission details section in detail panel |

