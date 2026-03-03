

# Accumulated Intelligence System: Issues Found

After deep review of the full flow — `process-meeting` → `synthesize-deal-intelligence` → `DealIntelligencePanel` → meeting add/remove → re-synthesis — here are the issues:

## Issue 1: Meeting Removal Does NOT Re-Synthesize or Clear Stale Intelligence
**File**: `MeetingsSection.tsx` line 305-312

When a meeting is removed, `lastContactDate` is recalculated (good), but:
- `dealIntelligence` is **never re-synthesized** — it still references the removed meeting's stakeholders, action items, objections
- If ALL meetings with intelligence are removed, `dealIntelligence` persists showing completely stale data
- Should re-synthesize if remaining meetings have intel, or clear `dealIntelligence` if none remain

## Issue 2: Manual "Add Meeting" Does NOT Update `lastContactDate`
**File**: `MeetingsSection.tsx` line 326-328

The `onAdd` callback only does `updateLead(lead.id, { meetings: updatedMeetings })`. Unlike auto-find (which calculates `latestDate` at line 139-143), manual add never updates `lastContactDate`. If you manually add a meeting with a recent date, the lead's contact date stays stale.

## Issue 3: Synthesis Happens Even Without Intelligence
**File**: `MeetingsSection.tsx` line 329-334

The check `if (meeting.intelligence)` gates synthesis, but consider: if AI processing fails (line 1056-1058 fallback), the meeting is added WITHOUT intelligence. The synthesis is skipped. But the user might manually add a meeting with no transcript (just a URL), then later process it — but there's no way to re-process a meeting after adding it. This is a gap but a separate feature, not a bug.

## Issue 4: Auto-find `synthesizeDealIntelligence` Call Timing
**File**: `MeetingsSection.tsx` line 154-160

`updateLead` is called at line 154, then `synthesizeDealIntelligence` at line 159. The synthesis calls `updateLead` again when it completes (line 191). This is correct — the second update merges `dealIntelligence` onto the lead. No bug here, just confirming it works.

## Issue 5: Re-Synthesize Button Works Correctly
**File**: `DealIntelligencePanel.tsx` line 62-95

The re-synthesize button reads meetings from `lead.meetings`, sorts them, calls the edge function, and updates. This is correct. Intelligence accumulates properly because the AI gets ALL meetings every time and builds the full picture from scratch.

---

## Fixes Needed (3 changes)

### Fix 1: Re-synthesize on meeting removal (`MeetingsSection.tsx`)
After removing a meeting, check if remaining meetings have intelligence. If yes, re-synthesize. If no meetings with intel remain, clear `dealIntelligence` to `undefined`.

### Fix 2: Update `lastContactDate` on manual add (`MeetingsSection.tsx`)
In the `onAdd` callback, compare the new meeting's date with `lead.lastContactDate` and include it in the `updateLead` call.

### Fix 3: Clear `dealIntelligence` when no meetings remain (`MeetingsSection.tsx`)
If all meetings are removed, explicitly set `dealIntelligence: undefined` in the update.

| File | Change |
|------|--------|
| `src/components/MeetingsSection.tsx` | Fix meeting removal to re-synthesize or clear intel; fix manual add to update lastContactDate |

No edge function changes needed. The synthesis engine correctly rebuilds from scratch every time — intelligence accumulates properly because it re-analyzes ALL meetings on each call.

