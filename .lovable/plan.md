

# Save & Refine AI Drafts

## Problem

All AI-generated content (follow-up emails, objection responses, nudges, meeting prep briefs) lives only in React state. Navigate away and it's gone. No way to edit or refine a draft before sending.

## Solution

### 1. New `lead_drafts` table

Stores every AI-generated draft persistently, tied to the lead.

```
lead_drafts
- id (uuid, PK)
- lead_id (text, NOT NULL) — references the lead
- draft_type (text) — "followup", "objection", "nudge", "prep", "strategic", "nba", "outreach", "renewal"
- action_key (text) — the unique key used in the UI (e.g., "objection-0", "waiting-2", "prep")
- content (text) — the generated email/brief content
- context_label (text) — human-readable label ("Re-engage Cody Miller", "Address: pricing objection")
- status (text, default "draft") — "draft" | "sent" | "discarded"
- created_at (timestamptz)
- updated_at (timestamptz)
```

RLS: Allow all operations for authenticated users (this is an internal sales tool).

### 2. Save on generation

When `handleDraftPriorityAction` or `handleGeneratePrep` completes successfully, upsert the result into `lead_drafts` (keyed on `lead_id + action_key`). This means re-generating overwrites the previous draft.

### 3. Load saved drafts on mount

When DealRoom loads, fetch all `lead_drafts` for this lead where `status = 'draft'`. Populate `draftedPriorityEmails` state from saved data so previously generated drafts appear immediately.

### 4. Inline editing

Replace the static `<pre>` draft display with an editable `<Textarea>`. Add a "Save" button that updates the draft in the database. The draft is always editable in-place.

### 5. Status actions

Each draft card gets:
- **Edit** (inline textarea, auto-focused)
- **Save** (persists edits to DB)
- **Regenerate** (re-runs AI, overwrites)
- **Discard** (sets status to "discarded", removes from view)

### UI per draft card

```text
┌─────────────────────────────────────────────┐
│ [editable textarea with draft content]      │
│                                             │
│ [Copy]  [Save]  [Regenerate]  [Discard]     │
└─────────────────────────────────────────────┘
```

## Files Changed

| File | Changes |
|------|---------|
| Migration | Create `lead_drafts` table with RLS policies |
| `src/pages/DealRoom.tsx` | Fetch saved drafts on load. Save drafts after generation. Replace static draft display with editable Textarea + Save/Regenerate/Discard buttons. Upsert on save/regenerate. |

