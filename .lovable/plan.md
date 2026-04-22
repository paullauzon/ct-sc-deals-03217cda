

# Round 6 — the deepest layer: noise classes, thread integrity, and the long tail

The numbers from the live audit show where the remaining 20,992 unmatched emails actually come from. Most aren't "missing rules" — they're **distinct categories of email that need their own handling lane**, not a single "unmatched" bucket.

## What the data says

| Category | Count | Today's behavior | Problem |
|---|---:|---|---|
| Role-based senders (info@, hello@, no-reply@) | **6,103** | Stuck in unmatched | Will never be claimable; pure noise |
| Out-of-office auto-replies | **1,097** | Stuck in unmatched | Should auto-park, not pollute |
| Calendar invites (Google/Outlook) | **470** | Stuck in unmatched | Already handled via Calendly path |
| CC-only matches to known leads | **994** | Refused (strict participant rule) | Should route, not refuse |
| Unmatched on a known thread | **132** | Refused | Pure auto-rescue, zero risk |
| Threads split across 2+ leads | **15 threads, ~80 msgs** | Both leads see partial context | Cross-deal contamination |
| Forwarded "Fwd:" with original sender | **103** | Attributed to forwarder, not orig | Wrong sender = wrong attribution |

That's **~8,800 unmatched messages** that have a deterministic right answer we're not yet executing.

## What to build

### 1. Thread-continuity auto-claim (132 messages, zero-risk)
If an email lands `unmatched` but its `thread_id` already maps to exactly one non-duplicate active lead, claim it to that lead automatically. No human review needed — thread membership IS the proof.
- Add to `rematch-unmatched-emails`: pre-pass that resolves these BEFORE any sender-domain logic
- Skip if thread spans 2+ leads (those are case #5 below)
- Honor `is_intermediary` — never auto-claim if the sender is flagged

### 2. CC participant routing (994 messages)
The strict matcher only checks `from_address` overlap. But if a known lead's primary email appears in `cc_addresses`, the email IS about that deal — the rep was looped in.
- Extend `safe-claim-email` participant logic: CC counts as overlap
- Add a daily cron pass `auto-attribute-cc-matches` that handles existing backlog
- Confidence scoring: from-match > to-match > cc-match — log the level used

### 3. Auto-park noise classes (8,200 messages combined)
Three classes need their own non-claimable destinations, not the unmatched queue:
- **`lead_id='auto_reply'`** sentinel for out-of-office (subject regex match at sync time). Visible in deal-room as a small "1 auto-reply" chip but doesn't pollute metrics.
- **`lead_id='role_based'`** sentinel for role addresses (info@, sales@, no-reply@, etc.) when no thread continuity exists. Hidden by default in Company Inbox; toggle to view.
- **Calendar invite handling**: route to `firm_activity` if the firm domain matches an active lead, else `role_based`.

Sync functions detect at insert time and route directly — no human action required.

### 4. Forwarded-email original-sender extraction (103 messages)
When subject starts with `Fwd:` / `Fw:`, parse `body_text` for the standard "From: name <email>" header block and use THAT for participant matching, not the forwarder.
- New helper `extract-original-sender.ts` shared util
- Used by both `rematch-unmatched-emails` and the sync functions for inbound only
- Visible in UI as a small "forwarded by {name}" badge on the email row

### 5. Split-thread reconciliation (15 threads, the cross-deal contamination)
The CT-328 / CT-412 / CT-273 cluster shows one Gmail thread carrying messages attributed to 3 different leads. Today both deal-rooms see only their slice. The real fix:
- New `lead_emails.canonical_thread_lead_id` column — the "primary owner" of the thread
- Daily cron `consolidate-split-threads`: for each split thread, pick the lead with the most messages OR the earliest message, set `canonical_thread_lead_id` on every message in the thread
- Deal-room shows the full thread (read-only on non-canonical leads) with a "Thread also seen on CT-XXX" link
- The split itself is preserved (each message keeps its own `lead_id`) but the **view** is unified

### 6. Sender-promotion guardrail
Today the Company Inbox "Route to {lead}" button optionally promotes the sender to a stakeholder. Two missing protections:
- If the sender's domain is on the noise list, refuse promotion
- If the sender is an `is_intermediary` on ANY other lead, surface a confirmation: "This contact is flagged as an intermediary on CT-XXX — promote anyway?"

### 7. Lead-deletion cascade for `firm_activity` and the new sentinels
When a lead is hard-deleted (rare but happens), its `firm_activity_emails` entries become orphans. Same will apply to `auto_reply` and `role_based` once added.
- Daily janitor extension: also delete `firm_activity_emails` rows whose underlying `lead_emails.id` is gone (currently 0, but the pattern will recur)

### 8. Bulk action on pending suggestions
The `auto-suggest-firm-attributions` job has produced 8 pending suggestions. The panel today only supports single accept/reject. With the daily cron filling it up, reps need:
- "Accept all from this sender" (one-click clear all 8 from `roman@duedilio.com` if accepted)
- "Reject all from domain {x}" (mark sender as noise + reject all suggestions in one shot)

### 9. Inbound rate-limit early warning
`lead_email_metrics.email_quarantined` only flips after 2+ bounces. But a sender hitting 50+ unmatched emails in 24h is almost certainly automated — newsletter, monitoring tool, abuse.
- New view `v_high_volume_unmatched_senders` (count by sender, last 24h)
- Surface in the Mailboxes screen: "These 4 senders sent 200+ messages in 24h — add to noise list?"

## What I deliberately do NOT recommend

- **Auto-extracting forwarded original sender for OUTBOUND** — we know who sent it
- **Auto-merging split threads into one lead** — preserves audit trail to keep messages where they were originally claimed
- **AI/LLM classification of "is this an auto-reply"** — the regex catches 95%+ for free; not worth API cost
- **Per-mailbox routing rules** (e.g. "everything from this Gmail account → Captarget")  — the brand inference from lead context already works

## Files

**New:**
- 1 migration: add `canonical_thread_lead_id` column to `lead_emails`; reserve `auto_reply` and `role_based` as protected lead_id sentinels
- `supabase/functions/_shared/extract-original-sender.ts` (forwarded-email parser)
- `supabase/functions/_shared/classify-email.ts` (noise-class detector: role-based, auto-reply, calendar)
- `supabase/functions/auto-attribute-cc-matches/index.ts` (one-time + daily cron)
- `supabase/functions/consolidate-split-threads/index.ts` (daily cron)

**Edited:**
- `supabase/functions/rematch-unmatched-emails/index.ts` — thread-continuity pre-pass + forwarded-sender extraction + intermediary skip
- `supabase/functions/sync-gmail-emails/index.ts` + `sync-outlook-emails/index.ts` — auto-park noise classes at insert time
- `supabase/functions/_shared/claim-email.ts` — CC overlap counts as match (with logged confidence level)
- `supabase/functions/safe-claim-email/index.ts` — guardrail: refuse promote if sender is intermediary or noise
- `supabase/functions/cleanup-unmatched-noise/index.ts` — extend to also clean orphan `firm_activity_emails`
- `src/components/CompanyInboxView.tsx` — show "auto-reply" / "role-based" filter chips, intermediary confirmation dialog
- `src/components/settings/PendingAttributionsPanel.tsx` — bulk accept/reject by sender or domain
- `src/components/MailboxSettings.tsx` — high-volume-sender warning panel
- `src/components/EmailsSection.tsx` — "forwarded by {name}" badge, "thread also on CT-XXX" disclosure for split threads
- 2 cron schedules: `auto-attribute-cc-matches-daily` (4:30 AM UTC), `consolidate-split-threads-daily` (4:45 AM UTC)

No schema changes to `leads` or `lead_email_metrics`. No backfill of historical metrics — the existing triggers handle reassignments.

