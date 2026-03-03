

# Dashboard Redesign + Fireflies Meeting Recording Integration

## Overview

Two workstreams: (1) Restructure the dashboard to prioritize deal-closing intelligence, (2) Add Fireflies meeting recording support per lead with manual transcript paste + AI-powered extraction of discussion summary and next steps.

---

## 1. Fireflies Recording Fields

### `src/types/lead.ts`
Add to Lead interface:
- `firefliesUrl: string` — link to the Fireflies recording
- `firefliesTranscript: string` — pasted transcript text
- `firefliesSummary: string` — AI-extracted discussion summary
- `firefliesNextSteps: string` — AI-extracted next steps

### `src/contexts/LeadContext.tsx`
- Add defaults for new fields (empty strings)
- Bump schema version to 6

### `src/components/LeadsTable.tsx` (LeadDetail panel)
Add a new **"Meeting Recording"** section after the Meeting section:
- Input for Fireflies URL (with small Fireflies flame icon inline)
- Large textarea for pasting the full transcript
- A "Summarize with AI" button that sends the transcript to an edge function, which calls Lovable AI to extract: (a) concise discussion summary, (b) bullet-pointed next steps
- Read-only display areas for the returned summary and next steps
- If no transcript yet, show a subtle empty state: "Paste your Fireflies transcript after the meeting"

### `src/components/Pipeline.tsx`
- On each pipeline card, if `lead.firefliesUrl` is set, show a small Fireflies flame icon (🔥 emoji or a tiny SVG) next to the meeting outcome line. This gives instant visual signal that a recording exists.

---

## 2. AI Transcription Summarization

### `supabase/functions/summarize-meeting/index.ts` (new edge function)
- Accepts `{ transcript: string }` in the body
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a system prompt:
  - "You are a sales meeting analyst. Given a meeting transcript, extract: 1) A concise 2-3 sentence summary of what was discussed, 2) A bulleted list of concrete next steps with owners if mentioned. Be direct and actionable."
- Returns `{ summary: string, nextSteps: string }`
- Non-streaming (uses `supabase.functions.invoke` pattern)

### `supabase/config.toml`
- Add function entry with `verify_jwt = false`

---

## 3. Dashboard Redesign

Reorganize `src/components/Dashboard.tsx` into a tighter, deal-closing-focused layout. Remove lower-value sections, promote high-impact ones.

### New layout (top to bottom):

**Row 1: Hero Metrics** (4 cards — unchanged but tighter)
- Total Leads, Pipeline Value, Win Rate, Avg Days to Meeting

**Row 2: Action Strip** (6 compact metrics — unchanged)

**Row 3: Two columns**
- Left: **Pipeline Funnel** (existing, keep)
- Right: **Owner Workload** (compacted into a table instead of 4 cards)

**Row 4: Two columns**
- Left: **Stale Leads Alert** (existing, keep — this is critical)
- Right: **Forecast Summary** (existing, keep)

**Row 5: Lead Volume chart** (existing stacked area — keep, full width)

**Row 6: Two columns**
- Left: **Brand Comparison** (compacted)
- Right: **Service Interest by Brand** (existing chart)

**Removed/collapsed sections** (moved to a collapsible "More Analytics" area at bottom):
- Deals Planned, Day of Week submissions, Role/Buyer Type, Company Leaderboard, Cross-Brand Duplicates, Source Breakdown, "How SC Found Us", Priority Distribution, Recent Leads, Service Interest (All)

This keeps the dashboard focused on: pipeline health, forecast, owner accountability, stale deals, and volume trends — the things that drive deal-closing decisions.

---

## 4. Files Changed

| File | Changes |
|------|---------|
| `src/types/lead.ts` | Add `firefliesUrl`, `firefliesTranscript`, `firefliesSummary`, `firefliesNextSteps` |
| `src/contexts/LeadContext.tsx` | Defaults for new fields, bump schema to 6 |
| `src/components/LeadsTable.tsx` | Add Meeting Recording section with transcript paste + AI summarize button |
| `src/components/Pipeline.tsx` | Add 🔥 icon on cards with Fireflies recordings |
| `src/components/Dashboard.tsx` | Reorganize layout: promote funnel/forecast/stale/owners, collapse secondary analytics |
| `supabase/functions/summarize-meeting/index.ts` | New edge function calling Lovable AI for transcript summarization |
| `supabase/config.toml` | Add summarize-meeting function entry |

### Technical Notes
- AI summarization requires Lovable Cloud to be enabled (for LOVABLE_API_KEY)
- Fireflies logo represented as 🔥 emoji (no external assets needed) — clean and recognizable
- Transcript + summary stored on the lead object in localStorage
- The "More Analytics" collapsible uses the existing Collapsible component from radix

