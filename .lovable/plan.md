

# Make Priority Actions Executable from the Actions Tab

## Problem

The Actions tab shows "Prep for meeting Apr 8" as a passive card. The salesperson sees what to do but can't do it from here — they'd have to navigate to the Meetings tab, find the prep button, and trigger it there. Same issue applies to other action types: "Reply to email" should open an email draft, "Re-engage" should offer a draft, etc.

## Solution

Add action buttons to each priority action card so the salesperson can execute directly:

### 1. "Prep for meeting" → "Generate Prep" button
- Add a `Button` to the prep card that calls `generate-meeting-prep` (same logic as `MeetingsSection.handleGeneratePrep`)
- Show the `PrepBriefDialog` inline in the Actions tab (import it from MeetingsSection or extract as shared component)
- On completion, the card updates to show "Prep brief ready — View"

### 2. "Reply to email" / "Re-engage" / "Follow-up overdue" → "Draft" button
- Add a "Draft" button that calls `draft-followup` edge function (same pattern as the Open Commitments draft button already on this page)
- Show the drafted email inline below the card, with Copy button

### 3. "Make first contact" (stale new lead) → "Draft Outreach" button
- Same draft-followup pattern with `actionType: "initial-outreach"`

### 4. "Renewal" → "Draft Renewal Email" button
- Draft button with renewal-specific context

### Implementation Details

**Extract `PrepBriefDialog` from MeetingsSection**: Currently it's a local component inside MeetingsSection.tsx. Move it to a shared location or export it so DealRoom can use it too.

**Add state to DealRoom.tsx**:
- `generatingPrep` / `prepBrief` / `showPrepDialog` for meeting prep
- `draftingPriority` / `draftedPriorityEmails` for priority action drafts (same pattern as existing `draftingIdx`/`draftedEmails`)

**Each priority action card gets a contextual button**:
- `type: "prep"` → "Generate Prep" button → opens PrepBriefDialog
- `type: "email"` → "Draft Reply" button → calls draft-followup
- `type: "dark"` → "Draft Re-engagement" button → calls draft-followup with re-engagement context
- `type: "followup"` → "Draft Follow-up" button → calls draft-followup
- `type: "stale"` → "Draft Outreach" button → calls draft-followup with initial-outreach
- `type: "renewal"` → "Draft Renewal" button → calls draft-followup

## Files Changed

| File | Changes |
|------|---------|
| `src/components/MeetingsSection.tsx` | Export `PrepBriefDialog` and `MeetingPrepBrief` type so DealRoom can reuse them |
| `src/pages/DealRoom.tsx` | Add prep brief state + generation handler. Add draft state for priority actions. Add contextual action buttons to each priority action card. Import and render PrepBriefDialog. |

