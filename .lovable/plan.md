
## Status: all 4 v5 remediation items already shipped

Verified by reading the current files:

| # | Item | File | Evidence |
|---|---|---|---|
| 1 | Tab horizontal scroll + right-edge fade | `LeadDetailPanel.tsx` 306-340 | `overflow-x-auto scrollbar-hide` wrapper + `bg-gradient-to-l` overlay |
| 2 | Notes edit / delete with AlertDialog | `LeadNotesTab.tsx` 1-205 | `parseNotesChronological` + `serializeNotes` + AlertDialog confirm |
| 3 | Stakeholder remove → AlertDialog | `StakeholderCard.tsx` 1-50, 47 | `removeTarget` state + AlertDialog (no `window.confirm`) |
| 4 | Realtime lead-row sync | `LeadContext.tsx` 217-248 | `liveFields` array covers stage / lead_status / priority / deal_value / close_confidence / contract_months / next_follow_up / next_mutual_step(_date) / competing_bankers / deal_narrative / assigned_to / forecast_category / icp_fit / meeting_outcome / notes / stage_entered_date / last_contact_date / closed_date / google_drive_link / forecasted_close_date |

Nothing in the v5 plan is outstanding. All four items are present in the code.

## What this means

You can stop and verify end-to-end now. There's nothing left to implement from the v5 fix pass — the prior "Approved → implemented" round shipped everything.

## Verification steps (browser)

1. Open any lead → confirm tab strip scrolls horizontally and right-edge fade is visible
2. Notes tab → hover an entry → Edit and Delete icons appear → Delete shows themed AlertDialog
3. Right rail → Stakeholders → click trash on any row → themed AlertDialog (not native browser prompt)
4. Open the same lead in two windows → change stage / value / status in one → other reflects within ~1s

## Items still on the broader v5 backlog (deferred — not in scope of this round)

These were explicitly deferred in the original v5 plan, listed here only so you know they're tracked:

- Risk register CRUD (needs `lead_risks` table)
- Champion star on stakeholders (needs `is_champion` bool)
- Snooze whole deal (needs `snoozed_until` column + pipeline filter)
- Field-level audit feed pane in Activity tab
- Deal narrative AI generation in `enrich-lead` edge function
- Captarget target-list deliverable card
- Saved views / bulk actions at the pipeline list level
- Mobile responsive pass

If you want any of these picked up in a v6 round, say which and I'll plan it.
