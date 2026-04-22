

# Round 5 — what's still missing, going beyond every prior plan

The structural plumbing is clean. What's missing is the **human-judgment surface** for the cases that no automatic rule can decide — which is exactly your original question: *"what happens if emails from his firm exist in any mailbox, but are unrelated to this specific prospect?"*

The audit found 9 distinct gaps. I'm grouping them by what they unlock.

## The headline answer to your question

Today, when an email arrives from `tim.murray@conniehealth.com` and Connie Health has 3 active leads (CT-004, CT-026, CT-179):
- **The matcher correctly refuses to guess** → email goes to `unmatched`
- **Company Inbox shows it** → with the new "previously seen on CT-004" hint
- **But there is no "park this for later"** affordance. Reps must either claim it to a lead OR leave it forever in the global Unmatched bucket polluting the queue.

What's needed: a third option — **"Set aside as Firm Activity"** — that detaches it from the unmatched queue, doesn't attribute it to any specific deal, but keeps it browsable on the firm's profile and on every related deal-room as "other firm activity."

That single concept resolves three real cases:
1. A junior at the firm emails about an unrelated topic → not yours, not noise
2. A different partner replies about a different deal → relevant context, wrong deal
3. Old correspondence from a stale relationship → archive without losing it

## What else is still missing

### 1. "Firm Activity" sidecar (the headline fix)
- New table `firm_activity_emails(email_id, firm_domain, set_aside_by, set_aside_at, note)` — pure pointer table, the email row stays intact in `lead_emails` but with `lead_id='firm_activity'` (new sentinel) so it disappears from unmatched + dashboards
- Company Inbox row gets a 3rd action button next to "Route to {lead}" / "Mark noise": **"Set aside (firm activity)"**
- Every active deal-room at the same firm domain shows a small **"5 firm-wide emails (not on this deal)"** disclosure card in the right rail. Clicking opens a read-only drawer.
- Client Account detail (post-Closed-Won) already has the cross-company `EmailsAtCompanyCard` — this gives the same surface to deals **before** they close

### 2. Tim Murray's exact bug — duplicate active leads
The DuplicateLeadsPanel detects the case (CT-004 + CT-179, same email, both active) but **the merge button isn't actually clickable yet** — just visually surfaces the pair. The Closed Lost CT-179 should be merged into the active CT-004 with one click.
- Wire the "Merge into canonical" action: set `is_duplicate=true, duplicate_of='CT-004'` on CT-179 and bulk-move its 6 stakeholders/tasks/activity rows. Email migration already happens via the `update_lead_email_metrics_on_claim` trigger.

### 3. Cross-firm "wrong deal" cases (the 9 multi-lead senders the audit found)
`roman@duedilio.com` is currently on 5 different leads. He's an M&A intermediary who pitches multiple sellers. Today his emails get re-attributed every time he replies on a new thread — perfect chaos.
- Add an `is_intermediary` flag to `lead_stakeholders`. When set, the matcher **never reassigns existing emails** based on this sender — it only attributes by thread continuity.
- Surface a "This sender appears on 5 deals — is this an intermediary/banker?" prompt in the Company Inbox when the count crosses 3.

### 4. "Firm-wide email view" on every deal-room (the user's exact ask, generalized)
Right now the deal-room only shows emails attributed to *that specific lead*. If Eric Lin (CT-026) is on a parallel thread about a different topic, the rep working CT-004 doesn't see it.
- New right-rail card on deal-room: **"Other contacts at {Company} — 4 active threads"**. Lists thread subjects + which lead they're on. Click to jump.
- Already partially exists in `EmailsAtCompanyCard.tsx` for client accounts — port it to the active deal-room too.

### 5. Auto-rescue for the 4,146 known-firm unmatched
The audit found **4,146 unmatched emails are from senders at domains where we have an active lead**. Most are probably claimable but the matcher refuses (multi-lead-at-firm guard). They're invisible unless someone manually opens Company Inbox.
- Daily cron `auto-suggest-firm-attributions` that scans these and creates a single-row `pending_attribution` record per (sender, lead_candidate, suggested_action) tuple. Surfaces in a new "Suggested attributions — 47 awaiting your call" badge on the Mailboxes screen.
- Each suggestion is a one-click accept/reject, and the helper logic uses thread-continuity (if the sender ever replied on a thread that landed on a specific lead, suggest that lead).

### 6. Stakeholder-on-duplicate cleanup (1 row found, but the pattern will recur)
The triggers handle email reassignment but `lead_stakeholders`, `lead_tasks`, `lead_activity_log`, and `lead_drafts` rows on duplicate leads are **never moved**. When DuplicateLeadsPanel merges a duplicate, these 26 rows (17 activity + 6 tasks + 2 drafts + 1 stakeholder today) become invisible.
- The merge action in DuplicateLeadsPanel must bulk-update `lead_stakeholders.lead_id`, `lead_tasks.lead_id`, `lead_activity_log.lead_id`, `lead_drafts.lead_id` to the canonical
- Add a daily janitor cron that catches any orphans that escape

### 7. Suppression list (currently zero rows, infrastructure exists but never written to)
`lead_email_metrics.email_quarantined` and `unsubscribed_all` columns exist; only Gmail sync writes `email_quarantined` after 2+ bounces. No UI surfaces it. No outbound send checks it.
- Add suppression check inside `send-gmail-email` and `send-outlook-email` — refuse to send if the lead is quarantined or unsubscribed
- Add an "Email suppressed" red banner in deal-room when active

### 8. Multi-recipient outbound attribution (2 cases found)
When a rep sends ONE outbound to 2 prospects' primary emails, only ONE lead gets the email logged. The other lead is silently uninformed.
- Detect at insert time: if `to_addresses` contains 2+ known-lead primary emails, create N copies of the row, one per `lead_id`. Mark them with a shared `original_message_id` so we don't double-count opens/clicks.

### 9. "Set this sender as noise just for this deal" (granular)
NoiseRulesPanel is global. But sometimes a domain (e.g. `acg.org`, an industry assoc) is noise for prospect deals but legitimate for a specific event we attended.
- Add a per-lead noise list: `lead_email_filters(lead_id, sender_pattern, action)`. Honored only inside that lead's deal-room view.

## What I deliberately do NOT recommend

- **Auto-merging duplicate leads on detection** — too risky; always require human click
- **Auto-reassigning intermediary emails retroactively** — same; only flag forward
- **Building a global "firm CRM" view** — Client Accounts already serves this for closed deals; deals before close don't need a separate view, just the disclosure card

## Files

**New:**
- 1 migration: `firm_activity_emails` table + `lead_email_filters` table + `pending_attribution` table + `is_intermediary` column on `lead_stakeholders`
- `supabase/functions/auto-suggest-firm-attributions/index.ts` (daily cron)
- `src/components/dealroom/FirmActivityCard.tsx` (right-rail on deal-room)
- `src/components/CompanyInboxView` — add "Set aside as firm activity" button + intermediary detection prompt
- `src/components/settings/PendingAttributionsPanel.tsx` (Mailboxes screen)

**Edited:**
- `src/components/settings/DuplicateLeadsPanel.tsx` — wire the merge button + bulk-migrate stakeholders/tasks/activity/drafts
- `supabase/functions/rematch-unmatched-emails/index.ts` — honor `is_intermediary` flag
- `supabase/functions/sync-gmail-emails/index.ts` + `sync-outlook-emails/index.ts` — duplicate inserts for multi-recipient outbound, populate `unsubscribed_all` from List-Unsubscribe header
- `supabase/functions/send-gmail-email/index.ts` + `send-outlook-email/index.ts` — refuse on suppressed
- `src/components/lead-panel/LeadPanelRightRail.tsx` — mount FirmActivityCard
- `src/components/EmailsSection.tsx` — surface suppression banner

No schema changes to `lead_emails` or `leads`. No backfill of historical metrics beyond the merge-driven trigger fires.

