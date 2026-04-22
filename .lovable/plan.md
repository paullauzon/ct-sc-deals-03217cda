

# Round 9 — Make every rule fire, finally answer "what about same-firm unrelated mail"

Round 8 was approved but never executed. The live data confirms the diagnosis is unchanged and even sharper:

| Metric | Live count | What it proves |
|---|---:|---|
| `unmatched` total | **23,130** | Every prior round was forward-only and didn't run |
| `classification_reason` populated | **0** | Round 7 column exists, no code writes it |
| Memoized noise senders | **0** | Table exists, no code inserts |
| `firm_unrelated` / `role_based` / `auto_reply` sentinel rows | **0 / 0 / 0** | Sentinels reserved, sync not routing to them |
| `firm_activity_emails` set-asides | **0** | UI buried, no auto-population |
| Per-lead noise filters | **0** | UI shipped, never adopted |
| Intermediaries flagged | **0** | Auto-suggest cron exists, surface invisible |
| Outbound stuck in unmatched | **3,310** | **100% internal-sender** — outbound matcher checks `from_address` instead of `to_addresses` |
| Same-firm-different-person inbound | **728** | The original prompt's missing case |
| `email_send_suppression` | **0** | Table reserved, sender code skips it |
| Quarantine flag flipped | **0** | Trigger never sets it |
| Pending suggestions awaiting action | **8** | Bulk actions still single-row |

## What we'll build

### 1. Fire the classifier on every code path
Wire `classifyEmail` end-to-end in both `sync-gmail-emails` and `sync-outlook-emails` and inside `rematch-unmatched-emails`:
- pass `hasListUnsubscribeHeader` (currently dropped silently),
- check `auto_classified_noise_senders` BEFORE running heuristics,
- check `email_noise_domains` and route hits to `role_based`,
- check `isInternalSender` and route accordingly,
- store the resulting `classification_reason` on every row so we can debug.

### 2. The original prompt's missing destination — `firm_unrelated`
Reserve a fourth sentinel `lead_id='firm_unrelated'` for the **728 same-firm-different-person** messages. Route at insert time when:
- `from_address` domain matches a known active lead's firm domain (excluding free-mail providers),
- AND the exact sender email is NOT in `leads.email`, `secondary_contacts`, or `lead_stakeholders`.

These messages are NOT noise (a real human at the firm wrote them), NOT a stakeholder (we'd already have them linked), and NOT unknown (we know the firm — just not THIS deal). Surfaced in the deal-room right rail as `"8 messages from {firm} (unrelated colleagues) ▾"` with one-click "promote sender to stakeholder" if a rep recognizes someone.

### 3. Outbound rep-as-sender repair (3,310 messages, one-line fix)
Live data confirms 100% of outbound-unmatched is internal sender. The matcher checks `from_address` against `leads.email`, but reps will never match. Add a dedicated outbound branch:
- if `direction='outbound'`: ignore `from_address`, require `to_addresses[]` overlap with a known lead/stakeholder/secondary,
- if no recipient matches but recipient is internal: route to `role_based` (rep-to-rep),
- backfill all 3,310 existing outbound rows in the same job.

### 4. Resumable, idempotent backlog reclaim
The Round 7 `reclaim-unmatched-backlog` button can't drain 23k rows in one edge invocation. Convert to a job model:
- new `reclaim_jobs` table tracks `cursor`, `total_remaining`, `status`,
- each invocation processes a 500-row chunk and persists cursor,
- new pg_cron `reclaim-unmatched-tick` runs every 2 minutes while a job is `running` and silently drains,
- UI button starts the job; progress survives page reloads.

### 5. Self-correcting noise — auto-promote high-volume senders
Any sender hitting **30 unmatched messages in 7 days** auto-inserts into `auto_classified_noise_senders` with reason `auto:high_volume`, and their backlog is reclassified to `role_based`. UI gets an "Undo (re-treat as unknown)" affordance.

### 6. Auto-flip `email_quarantined` (Round 7 #4, never built)
SQL trigger on `lead_email_metrics`:
- 2 hard bounces in 30 days → `email_quarantined=true`,
- a `complained` event (List-Unsubscribe-Post header on inbound) → quarantine immediately + insert into `email_send_suppression`.

Banner in `EmailsSection` shows the auto-reason and a one-click "Lift quarantine."

### 7. Wire `email_send_suppression` into outbound (Round 7 #8, never built)
Both `send-gmail-email` and `send-outlook-email` check the global suppression table for every recipient (to/cc/bcc, lowercased). Refuse with precise reason and offer admin override.

### 8. The "silent dropped ball" surface
Inbound emails on active leads aged 5–14 days with no outbound reply get inserted into the existing Action Center queue with kind `silent_inbound`. Surfaced as a top-priority chip on the deal-room. Connects email pipeline to the existing follow-up backlog instead of inventing a new surface.

### 9. Discoverable in-context UI — "Other firm activity" footer
Single muted disclosure row at the bottom of `EmailsSection`:

```text
[Other firm activity: 6 unrelated colleagues · 2 set-aside · 1 newsletter ▾]
```

Click → expand inline list with one-click actions (promote sender, undo set-aside, mark noise). Solves the discoverability problem of buried `firm_activity` and the new `firm_unrelated` bucket without a new tab.

### 10. Classification-reason chips
Now that #1 actually populates `classification_reason`, surface as a one-character chip in `CompanyInboxView` and `EmailsSection`: **T** (thread), **C** (CC overlap), **F** (forwarded), **N** (noise), **I** (internal), **U** (firm-unrelated). Hover for full reason.

### 11. Noise-domain conflict prompt on PendingAttributions accept
When a rep accepts a suggestion for a sender whose domain is in `email_noise_domains`: prompt *"This domain is currently marked as noise. Accepting will remove `{domain}` from the noise list. Continue?"* Honors the rep's correction and prevents oscillation.

### 12. Real attribution-health sparkline
`daily-attribution-health` already writes to `cron_run_log`; `AttributionHealthPanel` only shows totals. Add the 7-day sparkline: unmatched-delta line, auto-claimed-by-tier stacked bar, newly-quarantined count.

## What we deliberately do NOT build

- LLM "is this related to the deal" classification — deterministic firm-domain + participant rule is free and correct
- Auto-promoting `firm_unrelated` senders to stakeholders — keep the human in the loop
- Deleting historical noise messages — reclassification preserves audit trail
- Per-rep mailbox routing — already rejected, brand inference works

## Files

**New**
- 1 migration: reserve `firm_unrelated` sentinel; create `reclaim_jobs` table; add `auto_quarantine_on_bounce` trigger on `lead_email_metrics`
- `supabase/functions/_shared/firm-unrelated.ts` (same-firm-different-person detector)
- `supabase/functions/reclaim-unmatched-tick/index.ts`
- `supabase/functions/surface-silent-inbound/index.ts`
- `supabase/functions/auto-promote-noise-senders/index.ts`

**Edited**
- `supabase/functions/sync-gmail-emails/index.ts` + `sync-outlook-emails/index.ts` — pass List-Unsubscribe header, store `classification_reason`, check memo + noise list + internal-sender, route firm-unrelated, outbound branch via `to_addresses`
- `supabase/functions/_shared/claim-email.ts` — outbound branch (to/cc only), writes `classification_reason` on every claim
- `supabase/functions/safe-claim-email/index.ts` — same outbound branch + firm-unrelated guardrail
- `supabase/functions/rematch-unmatched-emails/index.ts` — apply all five rules; firm-unrelated routing; outbound recovery
- `supabase/functions/reclaim-unmatched-backlog/index.ts` — repurposed to enqueue a `reclaim_jobs` row; tick cron drains it
- `supabase/functions/send-gmail-email/index.ts` + `send-outlook-email/index.ts` — refuse on `email_send_suppression` hit (admin override)
- `src/components/settings/ReclaimBacklogPanel.tsx` — job-based progress, persistent across reloads
- `src/components/settings/AttributionHealthPanel.tsx` — 7-day sparkline + tier breakdown
- `src/components/dealroom/RightRailCards.tsx` — `firm_unrelated` count card with "promote sender" + "view all"
- `src/components/EmailsSection.tsx` — "Other firm activity" footer; classification-reason chips; auto-quarantine banner with "Lift" action
- `src/components/CompanyInboxView.tsx` — classification-reason chip on every row
- `src/components/settings/PendingAttributionsPanel.tsx` — noise-conflict prompt on accept
- `src/components/command-center/FollowUpsTab.tsx` — surface `silent_inbound` items
- 3 cron schedules: `reclaim-unmatched-tick` (every 2 min, no-op when no running job), `auto-promote-noise-senders-daily` (04:15 UTC), `surface-silent-inbound-daily` (07:00 UTC)

After this round the data flow is closed-loop: every inbound and outbound message either lands on a real lead, lands on a typed sentinel (`role_based` / `auto_reply` / `firm_activity` / `firm_unrelated`), or carries a machine-readable `classification_reason` explaining why it's still in `unmatched`. The original prompt — *"what about firm-mail unrelated to this prospect?"* — has a first-class home and a discoverable in-context UI for the human-judgment cases.

