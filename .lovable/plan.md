

# Next Steps Engine: What's Missing — Deep Audit

## What We Have Now

`getUnifiedActionCount` merges 4 sources: dropped promises, playbook tasks, next best action, overdue follow-up. `getNextBestAction` checks 6 scenarios (dropped promises, stalling momentum, unanswered proposal, neutral sentiment, they-owe-us, stage advancement).

**This is good but not the maximum.** Here's what a top-performing salesperson actually needs to know, that the system has data for but doesn't surface:

## Signals We Have Data For But Don't Use

### 1. Unanswered Inbound Emails
The `lead_emails` table tracks direction (inbound/outbound). FollowUpsTab already computes "unanswered" (last email was inbound = they wrote us and we didn't reply). This is a **critical** missed action — a prospect who emailed you and got silence is actively cooling. **Not in unified count.**

### 2. Going Dark Detection
We have `lastContactDate` on every lead. A deal in active stages (Meeting Held, Proposal Sent, Negotiation) with 7+ days of silence is going dark. FollowUpsTab surfaces this separately but the pipeline card and unified count ignore it. A card showing "4 next steps" that doesn't include "7d since last contact" is lying by omission.

### 3. No-Champion Risk as an Action
`getStakeholderCoverage` detects "no-champion" but only shows it as a passive badge. If you're past Meeting Held and have stakeholders mapped but no champion, the action is **"Identify and develop a champion"** — this should be a next step, not just an observation.

### 4. Open Objections That Need Resolution
`objectionTracker` has Open/Recurring objections. These are things the prospect said that we haven't addressed. Each is an action: "Address objection: [objection text]". **Not in unified count.** Currently only visible in Deal Room.

### 5. They Owe Us Something (Separate from NBA)
`actionItemTracker` items where owner = prospect name are things *they* committed to. The NBA engine buries this as one of many checks, but it deserves its own line: "Nudge: they owe [item]". A salesperson needs to see "you're waiting on them" distinctly from "you need to do something."

### 6. Meeting Prep Needed
If a lead has a Calendly booking (future `meetingDate`) and no meeting prep brief, the action is "Prep for upcoming meeting". This is time-sensitive and high-impact.

### 7. Stale New Leads
Leads in "New Lead" or "Qualified" with no contact made (no `lastContactDate`, no emails) that are 2+ days old. Action: "Make first contact".

## Proposed Enhancement: Complete Next Steps Engine

Expand `getUnifiedActionCount` to include **all** actionable signals, prioritized by urgency:

```text
Priority order (highest first):
1. Unanswered inbound email (they reached out, we're ghosting)
2. Dropped promises > 3d overdue (trust-breaking)
3. Meeting prep needed (time-sensitive)
4. Open objections (deal blockers)
5. Playbook tasks due
6. They owe us something (nudge needed)
7. Going dark — no contact 7+ days in active stage
8. No champion past Meeting Held
9. Overdue follow-up date
10. Stale new lead — no first contact
11. Next Best Action (AI recommendation, as catch-all)
```

### What Changes in the Tooltip

Instead of the current generic breakdown:
```
• 2 overdue commitments
• 1 playbook task due
```

Show prioritized, specific actions:
```
• Reply to their email from Mar 28
• Complete: "Send proposal deck"
• Address: "Concerned about pricing"
• Prep for call on Apr 5
• 2 playbook tasks due
```

### Single-Action Text Improvements

When only 1 action, show the most specific text possible:
- `Reply to [Name]'s email` (unanswered inbound)
- `Complete: "Send case study"` (dropped promise)  
- `Address: "Budget concerns"` (open objection)
- `Prep for meeting Apr 5` (upcoming meeting, no prep)
- `Nudge [Name] on: "Send org chart"` (they owe us)
- `Re-engage — 9d silent` (going dark)
- `Find a champion` (no champion risk)

### Data Requirements

**New query needed**: Fetch `lead_emails` for visible leads to detect unanswered inbounds. This is already done in FollowUpsTab — extract into a reusable hook `useUnansweredEmails(leadIds)`.

**Everything else** is already available on the `Lead` object or via `useLeadTasks`.

## Files Changed

| File | Changes |
|------|---------|
| `src/hooks/useUnansweredEmails.ts` | New hook — queries `lead_emails` for a set of lead IDs, returns `Set<string>` of lead IDs with unanswered inbound emails |
| `src/lib/dealHealthUtils.ts` | Expand `getUnifiedActionCount` to accept `hasUnansweredEmail` and `hasMeetingPrep` booleans. Add checks for open objections, no-champion-past-meeting-held, going-dark (7d+ silence in active stage), stale new leads. Richer `tooltipLines` with specific action text. Priority-ordered tooltip. |
| `src/components/Pipeline.tsx` | Import `useUnansweredEmails`, pass results into unified count. Detect upcoming meetings without prep. Pass all signals to `getUnifiedActionCount`. |

