

# Round 7 — Retroactive cleanup, broader noise detection, and the rep-as-sender loop

The data exposes a hard truth: **every Round 1-6 fix is forward-only.** 22,685 historical messages still rot in `unmatched`. And the noise classifier I shipped catches obvious patterns but misses ~80% of the real-world newsletter traffic.

## What the live audit reveals

| Finding | Count | Root cause |
|---|---:|---|
| Still in `unmatched` | **22,685** | Backfill never ran on historical rows — only new sync inserts get classified |
| Unmatched threads with a known-lead participant | **10,671** | Round 6 thread-continuity helper exists but was never invoked on the backlog |
| "Genuine unknown" senders that are actually newsletters | **~11,000** | Regex misses `announcements@`, `marketingops@`, `insights@`, `customerservice@`, `preqin.marketing@`, `news.*` subdomains |
| Internal sender (`adam.haile@sourcecodeals.com` etc.) sitting in unmatched | dozens | Rep-as-sender path only matches via outbound; inbound replies from internal team aren't claimed |
| `bounce_reason` populated but `email_quarantined` still false | 62 | The metric trigger updates `total_bounces` but never flips the quarantine flag |
| Stakeholders flagged intermediary | **0** | Round 5 UI shipped, but nobody has used it — auto-suggest never proposes intermediaries |
| Per-lead noise filters in use | **0** | Built and never adopted — needs a discoverable surface |
| Firm-activity set-asides | **0** | Same — no in-context prompt to use it |

## What to build

### 1. One-click historical backfill ("Reclaim the unmatched backlog")
A new admin-only edge function `reclaim-unmatched-backlog` that runs the full Round 6 pipeline against every existing `unmatched` row in chunks of 500:
- Re-classify with the (newly expanded) noise detector → route to sentinels
- Run thread-continuity auto-claim → 10,671 threads get resolved
- Run forwarded-sender extraction → ~108 reattributed
- Run CC-participant routing → backlog cleared
- Honor `is_intermediary` skips throughout
- Emit a single progress row in `cron_run_log` so the UI can poll
- New "Reclaim backlog" button in `MailboxSettings` showing live counts: "22,685 unmatched → re-process now"

### 2. Expanded noise classifier (the 11,000-newsletter problem)
Today's regex catches `info@`, `sales@`, `noreply@`. Real noise looks like `announcements@news.mcguirewoods.net`, `marketingops@spglobal.com`, `preqin.marketing@preqin.blackrock.com`. Add three additional detection layers:
- **Marketing subdomain detection**: any sender from `*.news.*`, `*.marketing.*`, `*.email.*`, `*.mail.*`, `newsletter.*`, `mailer.*` subdomains → `role_based`
- **Marketing-prefix locals**: `announcements@`, `insights@`, `customerservice@`, `preqin.marketing@`, `marketingops@`, `events@`, `webinar@`, `update*@`, `digest@`, `subscriptions@`, `unsubscribe@` → `role_based`
- **List-Unsubscribe header presence**: any inbound message carrying a `List-Unsubscribe` header in `raw_payload` is by definition bulk mail → `role_based` (this is the most reliable signal RFC 2369 provides)
- **High-volume sender memory**: once a sender hits the high-volume threshold (already detected in Round 6), a row in a new `auto_classified_noise_senders` table makes the classification permanent for that sender — future messages route to `role_based` without re-checking heuristics

### 3. Internal-team sender claim path
When the `from_address` is on an internal domain (`captarget.com`, `sourcecodeals.com`) and the message has a `thread_id` belonging to a known lead, claim it to that lead. When the thread is unknown, fall back to: if `to_addresses` contains a known-lead email, claim it there. If both fail, route to `role_based` (internal newsletter, status updates, etc.) NOT `unmatched`.
- New helper `is_internal_sender(email)` reads from `internal_domains` config
- Wire into both `rematch-unmatched-emails` and the sync functions

### 4. Quarantine flag auto-flip
Today's `update_lead_email_metrics` trigger increments `total_bounces` but never flips `email_quarantined`. Add a side-effect:
- After 2 hard bounces in 30 days → set `email_quarantined=true` automatically
- After 1 hard bounce + zero opens in 90 days → quarantine
- After a `complained` event (List-Unsubscribe-Post or reported-as-spam in headers) → quarantine immediately
- Surface in `EmailsSection` suppression banner with the AUTOMATIC reason: "Quarantined automatically — 2 bounces in 30 days. Review and lift?"

### 5. Auto-suggest intermediaries (the discovery problem)
Round 5's intermediary flag has zero usage because nobody knows when to apply it. Add a daily cron `auto-suggest-intermediaries` that scans for any sender appearing as a stakeholder (or sender) on **3+ active leads** across **2+ different firm domains** in the last 60 days and creates a row in `pending_attribution_suggestions` with reason `intermediary_candidate`. The existing `PendingAttributionsPanel` already handles UI — just add a new `kind` discriminator so the action routes to "Mark as intermediary" instead of "Promote to stakeholder".

### 6. Discoverable per-lead noise filters
Per-lead filters (Round 5) have zero adoption because they're invisible. Add a small inline action on every email row in `EmailsSection`: when a sender contributes ≥3 messages to a lead and is also in unmatched on other leads, show a chevron menu with "Hide all from {sender} on this deal." One click writes a `lead_email_filters` row.

### 7. Discoverable firm-activity set-aside
Same problem as #6 — `firm_activity_emails` table has 0 rows because the set-aside button is buried. Add a **right-click context menu** on email rows (and a kebab menu for accessibility) with three actions:
- "Set aside as firm activity" (creates `firm_activity_emails` row, hides from this lead)
- "Mark as noise — never attribute again" (adds sender to `email_noise_domains` if first time, removes the message)
- "Move to different deal…" (opens existing routing dialog)

### 8. Quarantine outbound to known-bounced addresses *across* leads
Today's quarantine is per-lead. If `john@acme.com` hard-bounced on Deal A, and a rep tries to email him on Deal B (he's a stakeholder elsewhere), nothing stops them. Add a global `email_send_suppression` table indexed by lowercase email, populated by:
- Hard bounce events from any lead
- Manual additions via "Suppress sender globally" action
- Have `send-gmail-email` and `send-outlook-email` refuse if the recipient appears in this table (with override for admins)

### 9. Show the "set-aside firm activity" inside the deal-room
The `FirmActivityCard` exists in the right rail. Two missing affordances:
- An "Undo set-aside" button on each card (returns email to `unmatched` or its prior `lead_id`)
- A daily count badge on the deal-room header tab so reps see "12 firm activity messages" without scrolling

### 10. Audit log for every classification decision
Today, when a message gets auto-routed to `role_based` or `firm_activity`, there's no record of WHY. When something is misclassified, debugging is impossible. Add lightweight logging to `cron_run_log` per batch (already exists), and a per-message JSON field `classification_reason` on `lead_emails`:
- Values like `noise:role_based_local`, `noise:list_unsubscribe_header`, `noise:high_volume_sender`, `thread_continuity:lead_X`, `cc_overlap:lead_X`, `forwarded_sender:lead_X`, `internal_sender:lead_X`
- Surfaced as a tiny chip on the email row in `CompanyInboxView` for transparency
- Also appears in the `EmailsSection` for any message flagged `firm_activity` so reps can see why

### 11. Two-way sync with `email_noise_domains` corrections
When a rep accepts a routing in `PendingAttributionsPanel`, that sender's domain might be in `email_noise_domains` from a prior bad addition. We should refuse the noise rule conflict and prompt: "This domain was previously marked as noise. Routing this email will remove the domain from the noise list. Continue?" Prevents oscillation.

### 12. Daily "attribution health" digest
A new `daily-attribution-health` cron emits one summary to `cron_run_log` covering:
- Unmatched count delta (yesterday vs today)
- Auto-claimed count by tier (thread / from / to / cc)
- Newly quarantined senders / leads
- Pending intermediary suggestions awaiting review
- Top 5 high-volume senders that should probably be marked noise

Surfaced as a single "Attribution health" card in `MailboxSettings` showing the last 7 days as a sparkline. Gives the team observability without needing to read the database.

## What I deliberately do NOT recommend (still)

- **AI-based classification of email purpose** — the rules cover 95%+ at zero cost
- **Auto-removing leads when a sender is reclassified as intermediary** — would erase audit trail
- **Auto-merging the `firm_activity` rows back into `unmatched` when a noise domain is removed** — keep the historical decision, just stop applying it forward
- **Gmail/Outlook label-based filtering** — provider-specific, brittle; semantic detection is better
- **Per-rep mailbox routing** — already rejected in Round 6, still applies

## Files

**New:**
- 1 migration: add `classification_reason` text column to `lead_emails`; create `auto_classified_noise_senders` (sender, classified_at, classified_as, message_count) and `email_send_suppression` (email, reason, added_at, added_by) tables; reserve constraints
- `supabase/functions/reclaim-unmatched-backlog/index.ts` — chunked re-processor (admin-triggered + optional weekly cron)
- `supabase/functions/auto-suggest-intermediaries/index.ts` — daily cron
- `supabase/functions/daily-attribution-health/index.ts` — daily digest cron
- `supabase/functions/_shared/internal-sender.ts` — internal-domain helper

**Edited:**
- `supabase/functions/_shared/classify-email.ts` — marketing subdomain rules, marketing-prefix locals, List-Unsubscribe header detection
- `supabase/functions/_shared/claim-email.ts` — checks `email_send_suppression` before allowing outbound; logs `classification_reason` on every claim
- `supabase/functions/sync-gmail-emails/index.ts` + `sync-outlook-emails/index.ts` — pass List-Unsubscribe header to classifier; route internal-sender messages; check `auto_classified_noise_senders`
- `supabase/functions/rematch-unmatched-emails/index.ts` — internal-sender pass; quarantine-flag side effects
- `supabase/functions/send-gmail-email/index.ts` + `send-outlook-email/index.ts` — also check `email_send_suppression` (global) in addition to per-lead quarantine
- `supabase/functions/auto-suggest-firm-attributions/index.ts` — handle "noise domain conflict" gracefully
- `src/components/MailboxSettings.tsx` — "Reclaim 22,685 unmatched" button + "Attribution health" 7-day sparkline card
- `src/components/EmailsSection.tsx` — kebab menu (Set aside / Mark as noise / Move to deal); classification-reason chip on firm-activity rows; auto-quarantine reason in suppression banner
- `src/components/CompanyInboxView.tsx` — classification-reason chip on every row for transparency
- `src/components/dealroom/RightRailCards.tsx` — "Undo set-aside" + count badge on FirmActivityCard
- `src/components/settings/PendingAttributionsPanel.tsx` — handle `intermediary_candidate` kind with "Mark as intermediary" action; noise-conflict prompt on accept
- 3 cron schedules: `reclaim-unmatched-backlog-weekly` (Sunday 03:00 UTC), `auto-suggest-intermediaries-daily` (05:00 UTC), `daily-attribution-health` (06:00 UTC)

No schema changes to `leads`. No backfill of `lead_email_metrics` totals — they remain accurate via the existing claim trigger that fires when historical rows get reclaimed.

