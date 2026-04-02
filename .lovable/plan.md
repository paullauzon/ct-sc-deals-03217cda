

# Follow-Ups Tab: Design Polish + AI-Powered Action Playbook

## Part 1: Row Design Fix

**Problem**: Rows blend together — no visual separation, everything is the same flat `px-4 py-2.5` with identical styling.

**Fix**: Add clear row separation with:
- Bottom border between rows (`border-b border-border`)
- Slightly more vertical padding (`py-3.5` instead of `py-2.5`)
- Left accent bar on hover (2px left border on hover, matching section color)
- Subtle alternating background on even rows (`even:bg-secondary/5`)
- Make the status label (e.g., "30d overdue") more prominent with a badge-style treatment instead of plain text

## Part 2: AI-Powered Follow-Up Action System

This is the real game-changer. A veteran doesn't just "follow up" — they execute a **specific playbook** based on where each deal stands. The system should auto-determine the right action type and generate AI-personalized content.

### Stage-Based Action Playbook

The system determines the **recommended action type** based on the lead's current state:

```text
STATE                          → ACTION TYPE
─────────────────────────────────────────────
New Lead, no contact           → Initial outreach email
Contacted, no meeting booked   → Meeting booking nudge
Meeting Set (upcoming)         → Pre-meeting prep reminder
Meeting Held, no follow-up     → Post-meeting follow-up email
Proposal Sent, no response     → Proposal check-in
Going Dark (21+ days silent)   → Re-engagement attempt
Unanswered inbound email       → Reply to their message
Has open action items          → Complete action items first
```

### What Each Action Generates (AI-Powered)

Each action type produces a **draft** using the existing `draft-followup` edge function pattern, customized with:
- Lead's enrichment data (company, motivation, urgency)
- Meeting intelligence (what was discussed, pain points, objections)
- Deal intelligence (action items, stakeholder info, win strategy)
- Psychological profile (communication style, real motivations)

**Action Types:**

1. **Draft Email** — AI generates a contextual follow-up email based on stage + meeting history. Uses existing `draft-followup` edge function, extended with a `template` parameter for different email types (post-meeting, proposal follow-up, re-engagement, initial outreach).

2. **Schedule Call** — Shows a one-click "Schedule Follow-Up Call" that sets `nextFollowUp` to a suggested date and adds a note about what to discuss (pulled from open action items / objections).

3. **Prep Brief** — For leads with upcoming meetings, links to the existing meeting prep brief or triggers generation.

### UI: Action Chip on Each Row

Replace the generic "Next Step" popover button with a **contextual action chip** that shows the specific recommended action:

```text
[✉ Draft Follow-Up]  — for post-meeting leads
[✉ Send Proposal]    — for Meeting Held leads ready to advance
[📞 Schedule Call]    — for leads needing a call
[↩ Reply]            — for unanswered inbound
[🔄 Re-engage]       — for going dark leads
```

Clicking the chip opens a **slide-out panel** (not a tiny popover) with:
- The AI-generated draft email (editable)
- Suggested follow-up date
- Suggested stage change
- "Mark Done" button that updates the lead + sets next follow-up

### New Edge Function: `generate-follow-up-action`

Extends the existing `draft-followup` function to handle multiple action types via a `type` parameter:
- `post-meeting` — current behavior
- `initial-outreach` — intro email based on enrichment
- `proposal-followup` — check-in after proposal sent
- `re-engagement` — win-back email for dark leads
- `reply-inbound` — suggested reply to their last email

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `src/components/command-center/FollowUpsTab.tsx` | Row design upgrade (borders, padding, badges). Replace "Next Step" popover with contextual action chip. Add action panel slide-out with AI draft, suggested date, stage change. |
| `supabase/functions/generate-follow-up-action/index.ts` | New edge function extending draft-followup pattern with multi-type support (post-meeting, outreach, re-engage, reply, proposal). Uses existing OPENAI_API_KEY. |

### Action Type Determination Logic (client-side)
```typescript
function getActionType(lead: Lead): ActionType {
  if (unansweredInbound) return "reply-inbound";
  if (stage === "New Lead" && !lastContactDate) return "initial-outreach";
  if (stage === "Meeting Held" && hasRecentMeeting) return "post-meeting";
  if (stage === "Proposal Sent") return "proposal-followup";
  if (daysSilent > 21) return "re-engagement";
  return "schedule-call"; // default
}
```

### Data Flow
1. User clicks action chip → opens Sheet (slide-out panel)
2. Sheet calls `generate-follow-up-action` edge function with lead data + action type
3. AI returns draft email + suggested next steps
4. User edits, then clicks "Send & Update" which updates lead fields

