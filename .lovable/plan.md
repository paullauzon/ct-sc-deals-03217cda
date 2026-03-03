

# Multi-Meeting Fireflies Integration with Auto-Processing

## Current State

- Each lead has a single set of Fireflies fields: `firefliesUrl`, `firefliesTranscript`, `firefliesSummary`, `firefliesNextSteps`
- The Fireflies import fetches meetings and assigns one per lead
- Summarization is manual (click a button) or happens during bulk import
- No auto-search by lead email/name in Fireflies

## What We'll Build

A complete meetings system where each lead can have **multiple meetings**, each auto-processed with AI summaries the moment they're added. Meetings accumulate over time and each one builds on the context of prior conversations.

---

### 1. Data Model: Multi-Meeting Support

**Update `Lead` type** — replace the four flat `fireflies*` fields with a `meetings` array:

```text
Meeting {
  id: string
  date: string
  title: string
  firefliesUrl: string
  transcript: string
  summary: string        // AI-generated
  nextSteps: string      // AI-generated
  addedAt: string        // timestamp
}

Lead {
  ...existing fields
  meetings: Meeting[]    // replaces firefliesUrl/Transcript/Summary/NextSteps
}
```

Backward-compatible migration: if a lead has old `firefliesTranscript` data, convert it into a single `Meeting` entry on load.

### 2. New Edge Function: `process-meeting`

Replaces the existing `summarize-meeting` function with a smarter version that:

- Accepts the **current transcript** plus **summaries of all prior meetings** for the same lead
- Produces:
  - **Comprehensive summary** of what was discussed (key topics, pain points, interest level, decisions made)
  - **Clear next steps** with owners and deadlines if mentioned
  - **Cumulative context note** — what changed since the last meeting
- Uses Lovable AI (`google/gemini-3-flash-preview`)
- Auto-triggers on add — no manual "Summarize" button needed

### 3. Updated Edge Function: `fetch-fireflies`

Add a new mode: **search by lead**

- Accept an optional `searchEmails` and `searchNames` parameter
- Query Fireflies for transcripts matching those participants
- Return only new meetings not already imported (compare by `firefliesId`)
- This enables the "Auto-find meetings" button per lead

### 4. UI: Meeting Recording Section (Lead Detail Panel)

Replace the current single-transcript section with a meetings timeline:

- **Header**: "Meetings (3)" with an "Add Meeting" button and "Auto-find in Fireflies" button
- **Meeting list**: Accordion/collapsible cards, newest first, each showing:
  - Title, date, duration
  - AI summary (auto-generated)
  - Next steps (auto-generated)  
  - Expandable full transcript
  - Fireflies link (if available)
- **Add Meeting dialog**: Two modes:
  - **Paste transcript** — paste text, optionally add a Fireflies URL, auto-summarizes on save
  - **Paste Fireflies URL** — we fetch the transcript via the API and auto-process
- **Auto-find**: Searches Fireflies by lead email/name, shows matches, user confirms which to import

### 5. Contextual AI Summarization

The key differentiator: each meeting summary is **informed by prior meetings**.

The prompt sent to the AI will include:
- The current transcript (truncated to ~15k chars)
- Summaries + next steps from all prior meetings for this lead (compact format)
- Instructions to note what's new/changed, whether prior next steps were addressed, and how the relationship is progressing

### 6. Bulk Import Updates

Update `FirefliesImport.tsx` to support the new multi-meeting model:
- A lead can receive multiple meetings from a single import
- Already-imported meetings (matched by `firefliesId`) are skipped
- Count shows "3 new meetings for 2 leads" style messaging

---

## Files Changed

| File | Changes |
|------|---------|
| `src/types/lead.ts` | Add `Meeting` interface, add `meetings: Meeting[]` to `Lead`, keep old fields for migration |
| `src/contexts/LeadContext.tsx` | Add `addMeeting(leadId, meeting)` method, migration logic for old flat fields → meetings array |
| `supabase/functions/process-meeting/index.ts` | New: context-aware summarization that accepts prior meeting summaries |
| `supabase/functions/fetch-fireflies/index.ts` | Add `searchEmails`/`searchNames` params for per-lead search mode |
| `src/components/LeadsTable.tsx` | Replace `FirefliesSection` with new `MeetingsSection` — accordion of meetings, add meeting dialog, auto-find button |
| `src/components/FirefliesImport.tsx` | Update to support multi-meeting per lead, deduplicate by firefliesId |
| `supabase/config.toml` | Add `[functions.process-meeting]` entry |

