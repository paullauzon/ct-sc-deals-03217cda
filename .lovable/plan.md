

# Surface & Unify Duplicate Leads

## Current State

- **Cross-brand duplicates** (same email, different brand) are flagged with `isDuplicate`/`duplicateOf`, but the link is one-to-one and only shows a minimal "Also submitted via..." section with source and date.
- **Same-brand duplicates** (same email, same brand) are silently deduplicated at init time — the older submission is dropped entirely, losing its message/dates.
- There's no way to see **all submissions** from a person across all sources (CT Contact, CT Targets, SC Intro, SC Targets).
- The current duplicate section only shows the other brand's source and a truncated message — no side-by-side comparison of what changed.

## What This Changes

Instead of silently dropping same-brand duplicates and showing a minimal cross-brand note, we'll:

1. **Keep all submissions** as a `submissions` array on each lead (instead of discarding older ones)
2. **Merge duplicates into a single canonical lead** with the most recent data, but preserve every original submission for audit
3. **Show a prominent "Submission History" section** in the lead detail panel that displays all submissions chronologically, with clear brand/source badges and diff highlights for fields that changed between submissions

## Plan

### 1. Add `Submission` type to `src/types/lead.ts`

```typescript
export interface Submission {
  brand: Brand;
  source: LeadSource;
  dateSubmitted: string;
  message: string;
  dealsPlanned: string;
  targetCriteria: string;
  targetRevenue: string;
  geography: string;
  currentSourcing: string;
  hearAboutUs: string;
  acquisitionStrategy: string;
  buyerType: string;
  role: string;
  phone: string;
}
```

Add `submissions: Submission[]` to the `Lead` interface.

### 2. Update `src/data/leadData.ts` — merge instead of drop

- Modify `deduplicateWithinBrand` → `mergeAllDuplicates`: group by normalized email across ALL brands/sources, produce one canonical lead per email with the most recent data as the primary, and store all original submissions in the `submissions` array.
- Remove `flagDuplicates` (no longer needed — duplicates are merged, not flagged).
- Keep `isDuplicate: true` on merged leads that had cross-brand submissions (for backward compat with pipeline badges).

### 3. Update `src/contexts/LeadContext.tsx`

- Add `submissions: []` to `LEAD_DEFAULTS` so migration handles existing leads.

### 4. Update `src/components/LeadsTable.tsx` — new Submission History section

- Replace the small "Cross-Brand Submission" section with a richer **"Submission History"** section that appears when `lead.submissions.length > 1`.
- Each submission shows: brand badge (CT/SC), source label, date, and the message. Fields that differ from the current/canonical values get a subtle highlight.
- Remove the old `isDuplicate && duplicate` section.
- Update the header to show a "Multi-source" badge when there are submissions from different brands/sources.

### 5. Update `src/components/Pipeline.tsx`

- Update the duplicate indicator to show submission count instead of just "Also via SC/CT".

### Visual Layout in Lead Detail

```text
┌─────────────────────────────────────┐
│ SC  Vidushi Gupta                   │
│ Partner · Company Name              │
│ 🔄 3 submissions (CT + SC)         │
├─────────────────────────────────────┤
│ ...existing sections...             │
├─────────────────────────────────────┤
│ ▾ Submission History (3)            │
│                                     │
│  CT Contact Form · Nov 15, 2025     │
│  "We're looking to acquire..."      │
│  Deals: 2-3 · Rev: $5M-$20M        │
│                                     │
│  SC Intro Call · Dec 3, 2025        │
│  "Following up on our call..."      │
│  Deals: 1-2 · Rev: $10M-$30M  ← changed │
│                                     │
│  CT Free Targets · Jan 8, 2026     │
│  "Need target list for..."          │
│  Geography: Northeast  ← new       │
└─────────────────────────────────────┘
```

