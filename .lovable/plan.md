

# What remains in the email/communication system — full sweep

Gmail core sync is done. Here's everything else that was deferred across past plans, ranked by impact. None are blockers; all are "next-tier" polish that move the system from "works" to "excellent."

## Gap A — Click tracking (link analytics)
**Today:** We track opens via 1×1 pixel. We do NOT track link clicks. Reps can't see which CTAs land.
**Build:**
- New `track-email-click` edge function — accepts `eid` + `url`, appends `{at, url, ua}` to `lead_emails.clicks`, then 302-redirects to the original URL.
- `send-gmail-email` — rewrite every `<a href="X">` in the outbound HTML to `https://.../track-email-click?eid={id}&url={encoded X}` BEFORE sending. Skip rewriting `mailto:`, `tel:`, and our own pixel URL.
- DB trigger already aggregates clicks into `lead_email_metrics` — no schema change needed.
- `EmailsSection` already shows click badges — they'll light up automatically.

## Gap B — Mailbox health monitoring (bounces, quota, quarantine)
**Today:** `lead_email_metrics` has `email_quarantined` + `unsubscribed_all` columns but nothing writes to them. Bounces from Gmail are invisible.
**Build:**
- `sync-gmail-emails` — detect bounce notifications (sender = `mailer-daemon@`, subject starts with "Delivery Status Notification"). Parse the failed recipient and write `bounce_reason` on the matching outbound `lead_emails` row, then increment `lead_email_metrics.total_bounces`.
- Auto-flag `email_quarantined=true` after 2 hard bounces from the same recipient.
- `EmailsSection` — show a small "Bounced" pill on outbound rows that bounced, plus a banner on the lead detail panel when `email_quarantined=true`.

## Gap C — Reply detection (close the loop on outbound)
**Today:** `lead_emails.replied_at` exists but is never populated. So "did they reply?" is invisible in metrics.
**Build:**
- `sync-gmail-emails` — when inserting an inbound email, look up the most recent outbound email in the same `thread_id` and set its `replied_at = email_date`.
- Existing `update_lead_email_metrics` trigger already increments `total_replies` and `last_replied_date` from `replied_at`. No new schema.
- Surfaces immediately in `EmailMetricsCard` as response rate.

## Gap D — Mark inbound as read when opened in CRM
**Today:** `lead_emails.is_read` exists but is always `false`. The "X unread" badge can't be built.
**Build:**
- `EmailsSection` — when a user expands an inbound email row, `UPDATE lead_emails SET is_read=true WHERE id=$1`.
- Add an unread count badge per lead in the Activity tab and on the lead detail panel header.

## Gap E — Email templates (snippets / canned responses)
**Today:** Compose drawer is blank every time. Reps retype the same intro paragraphs daily.
**Build:**
- New table `email_templates` (id, name, brand, subject_template, body_template, variables[], created_by, created_at).
- New panel inside `EmailComposeDrawer`: "Insert template" dropdown, with `{{first_name}}`, `{{company}}`, `{{deal_value}}` variable interpolation from the lead.
- Seed 4-6 templates: Discovery follow-up, Proposal nudge, Proof case study, Re-engage stale, Calendly link.
- "Save as template" button on any sent email.

## Gap F — Scheduled send / send later
**Today:** Sends fire immediately. Reps writing at 11pm send at 11pm.
**Build:**
- Add `scheduled_for` column on `lead_emails`, plus a status `scheduled`.
- `EmailComposeDrawer` — "Send" button gets a dropdown: Now / In 1 hour / Tomorrow 8am / Pick time.
- New cron `process-scheduled-emails` runs every 5 min — finds rows where `status='scheduled' AND scheduled_for <= now()`, calls `send-gmail-email` for each.
- "Cancel send" button on any row with `status='scheduled'`.

## Gap G — Per-user mailbox ownership / RLS
**Today:** Any authenticated user sees every connection. There is no RLS — `user_email_connections` has a public-allow policy.
**Decision needed first:** Should Adam see only his mailbox, or all team mailboxes?
**Build (after decision):**
- Add `user_id` column to `user_email_connections`.
- Replace blanket policy with: own connection always; if role=admin, see all.
- Filter `MailboxSettings.tsx` accordingly. Sync stays admin/system-wide.

## Gap H — Gmail rate-limit handling (429)
**Today:** A 429 response during message fetch is logged and skipped. Rare today, real risk at 4-5 mailboxes backfilling at once.
**Build:**
- Wrap the Gmail message fetch in a small retry helper: respect `Retry-After`, exponential backoff (1s, 2s, 4s) up to 3 attempts, then defer to next cron tick.
- Pause the entire mailbox's run on the second 429 of a single batch — don't burn quota.

## Gap I — Image-proxy false-positive opens
**Today:** Gmail prefetches images via Google's proxy as soon as it's delivered. Our pixel can fire within seconds of send, registering a "fake open" before the recipient opens.
**Build:**
- Detect `User-Agent` containing `GoogleImageProxy` in `track-email-open`.
- Either: tag those opens as `proxy: true` and exclude from "real opens" count, OR ignore opens that arrive within 30s of `email_date`.
- Filter accordingly in `EmailsSection` open badge.

## Gap J — Outlook (still paused, real product gap)
**Today:** `sync-outlook-emails` exists but dormant. SourceCo team's emails are invisible.
**Status:** Blocked on `MICROSOFT_OUTLOOK_API_KEY` + sourcecodeals.com tenant admin consent. Zero code change until that's unblocked. When it is, mirror the full Gmail pattern (OAuth start/callback, token refresh, send, reply, pixel, sync-runs audit).

## Gap K — Email features tied to nurture / next-steps
**Today:** Inbound replies don't trigger anything. A "yes please send a proposal" email sits passively in the thread.
**Build (smaller, fast):**
- When `sync-gmail-emails` inserts an inbound email matched to a lead, also write a `lead_activity_log` row with `event_type='email_received'`. Already have `next_steps` engine — it can detect "unanswered inbound" as a 16th signal.
- `useUnansweredEmails` hook already exists — wire it into `ActionQueue` so unanswered inbound emails surface as a top action chip.

## Recommended order for next session

1. **Gap C (reply detection)** — 30 lines in sync function, instant value, zero risk.
2. **Gap D (mark as read)** — small UI change, unlocks the unread badge UX.
3. **Gap A (click tracking)** — high analytical value, ~80 lines.
4. **Gap B (bounce detection)** — protects sender reputation as volume grows.
5. **Gap E (templates)** — biggest daily-rep time saver.
6. Then tackle F (scheduled send), I (proxy filter), H (rate-limit), K (nurture link), and finally G (per-user RLS) once you've decided the ownership model.

## What I'd skip / defer indefinitely

- Outlook (Gap J) — blocked externally, no code work possible.
- Don't add A/B subject-line testing, smart-send-time prediction, or AI-summarized thread digests until templates + replies + clicks are live and producing data to learn from.

## Files / changes

- `supabase/functions/sync-gmail-emails/index.ts` — reply detection (C), bounce detection (B), rate-limit retry (H), activity log writes (K)
- `supabase/functions/send-gmail-email/index.ts` — link rewriter (A)
- New `supabase/functions/track-email-click/index.ts` — click endpoint (A)
- `supabase/functions/track-email-open/index.ts` — proxy filter (I)
- New `supabase/functions/process-scheduled-emails/index.ts` — scheduled send dispatcher (F)
- `src/components/EmailsSection.tsx` — bounce pill, mark-as-read on expand, unread badges (B, D)
- `src/components/lead-panel/dialogs/EmailComposeDrawer.tsx` — template picker, scheduled send picker (E, F)
- New `src/components/EmailTemplates.tsx` — template manager + seed UI (E)
- New migration — `email_templates` table + `lead_emails.scheduled_for` + `lead_emails.status` columns
- `supabase/config.toml` — `verify_jwt = false` for `track-email-click` and `process-scheduled-emails`

Pick which gap(s) you want me to implement next and I'll build them in one focused pass.

