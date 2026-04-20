

# Email intelligence — end-to-end implementation audit

## Everything from the original multi-session plan, verified against the live code + DB

| Phase | Item | Status | Evidence |
|---|---|---|---|
| **Phase 1** | `sync-gmail-emails` accepts `{force_full: true}` → 90-day sweep | ✅ Shipped | `FIRST_RUN_WINDOW = "newer_than:90d"`, `MAX_FIRST_RUN = 1500` |
| 1 | "Backfill 90d" button per mailbox in Settings | ✅ Shipped | `MailboxSettings.tsx` line 187 `backfill90d()` |
| 1 | Auto-sync for any new mailbox (cron loops all active connections) | ✅ Shipped | 23 successful incremental runs in last 3 days |
| 1 | 90-day backfill actually executed against the 1 live mailbox | ⛔ **Not yet run** | Only 1 row in `lead_emails`; button exists but Malik hasn't clicked it |
| **Phase 2** | Activities tab = unified timeline | ✅ Shipped | `UnifiedTimeline.tsx` merges activity_log + lead_emails |
| 2 | Filter chips: All / Emails / Meetings / Notes / Stage / System / Pinned | ✅ Shipped | `FILTERS` const |
| 2 | Debounced search across subject + body_preview + notes | ✅ Shipped | `search` state + filter loop |
| 2 | Date range chips (7d / 30d / 90d / All) | ✅ Shipped (bonus vs. plan) |
| 2 | Open/click pills, Replied chip, AI-drafted badge, sequence tag, attachment count | ✅ Shipped | `EmailRow` type reads `ai_drafted`, `sequence_step`, `opens`, `clicks` |
| 2 | Inline Reply + Compose | ✅ Shipped | `onReply` threaded through |
| 2 | Actor name on every row | ✅ Shipped | `actor_name` column populated |
| **Phase 3** | Overview tab as new first tab | ✅ Shipped | `LeadOverviewTab.tsx` |
| 3 | 4 stat cards (Stage, Deal Value, Health, Touchpoints) | ✅ Shipped |
| 3 | Pinned note banner | ✅ Shipped | reads `lead_activity_log.pinned_at` |
| 3 | Top 2 upcoming tasks | ✅ Shipped |
| **Phase 4** | Email tab: 1-to-1 default, `Show all` toggle | ✅ Shipped | line 104 `showMarketing` |
| 4 | Thread-level aggregate stats (`N opens · M clicks · K replies`) | ✅ Shipped | line 182–198 |
| 4 | Latest-reply preview snippet | ✅ Shipped | line 349–378 |
| 4 | Global Expand/Collapse all | ✅ Shipped | `expandAllSignal` propagated to ThreadCard + EmailRow |
| 4 | "Compose" CTA in header | ✅ Shipped |
| **Phase 5** | `generate-stage-draft` edge function | ✅ Shipped | STAGE_PROMPTS for Sample Sent / Proposal Sent / Negotiating / Closed Won + STALL_PROMPT |
| 5 | Auto-trigger on stage change | ✅ Shipped | `LeadContext.tsx` line 361–366 |
| 5 | Stall trigger (Proposal Sent > 7d silent) wired into SLA cron | ✅ Shipped | `enforce-stage-slas` rule `proposal-sent-7d-silent-draft` |
| 5 | Drafts land in `lead_drafts` → Actions tab | ✅ Shipped | function writes row, UI consumes |
| 5 | Idempotent stall draft (no duplicate pending drafts) | ✅ Shipped | unique constraint `lead_drafts_lead_action_key_uniq` + SLA check |

## Gaps — what is actually missing

Three real loose ends, all in Phase 5's tail:

1. **`send-gmail-email` doesn't stamp `ai_drafted=true`** — the column exists, the UnifiedTimeline reads it and shows an AI badge, but nothing in the send pipeline ever sets it to true. Result: 0 rows in `lead_emails` with `ai_drafted=true`, so the AI badge never lights up. Need: when `EmailComposeDrawer` sends a message that came from a `lead_drafts` row (or a stage-triggered draft), pass a flag through and stamp the inserted `lead_emails` row.

2. **Inbound-reply → AI response draft trigger** — the plan included "Inbound reply received on stalled proposal → draft response using reply context." No code path exists for this. Options: add a DB trigger on `lead_emails` INSERT where `direction='inbound'` AND the thread has a pending stall draft → invoke `generate-stage-draft` with `trigger='reply'`; or a 15-min cron sweep.

3. **The 90-day backfill has not been executed yet for the one live mailbox.** Not a code gap — just a one-click action. Once Malik clicks "Backfill 90d" in Settings, expect 300–1000 email rows to flood in and auto-match to existing leads, lighting up the full Activities + Email tabs retroactively.

## Proposed closure plan (1 session)

### A. Stamp `ai_drafted` on send

`src/components/lead-panel/dialogs/EmailComposeDrawer.tsx` — accept a new optional prop `sourceDraftId?: string` (already threaded via AI draft prefill in Actions tab). When set, pass `{ ai_drafted: true, source_draft_id }` to `send-gmail-email`.

`supabase/functions/send-gmail-email/index.ts` — accept `ai_drafted` in body; include it in the pre-insert on `lead_emails` + update the row on successful send. Also mark the originating `lead_drafts` row `status='sent'`.

### B. Inbound-reply trigger

Add `supabase/functions/on-inbound-reply/index.ts` (invoked by a DB trigger or tack onto `sync-gmail-emails` post-insert loop). For every new inbound email:
- If the lead has a pending stall draft in `lead_drafts`, auto-discard it (the reply obviates it).
- If the lead is in Proposal Sent / Negotiating stages, invoke `generate-stage-draft` with `trigger='reply'` (new prompt: 80 words, acknowledges their reply, proposes a next step).
- Idempotent via `action_key = reply-<email_id>`.

Add a new `STAGE_PROMPTS` entry + update `generate-stage-draft` to accept `trigger='reply'` and read the latest inbound email body as context.

### C. Execute the 90-day backfill

Documentation/action item — not code. Once A + B ship, Malik clicks "Backfill 90d" in Settings once; the whole system lights up with real history.

## Files touched

| File | Change |
|---|---|
| `supabase/functions/send-gmail-email/index.ts` | Accept `ai_drafted` + `source_draft_id` in body; stamp column on insert; mark source draft as sent |
| `src/components/lead-panel/dialogs/EmailComposeDrawer.tsx` | Pass `sourceDraftId` through when draft-prefilled |
| `src/components/lead-panel/LeadActionsTab.tsx` | Pass draft ID into compose drawer |
| `supabase/functions/generate-stage-draft/index.ts` | Add `trigger='reply'` prompt + inbound email context reader |
| `supabase/functions/sync-gmail-emails/index.ts` *(or new trigger)* | Post-insert hook: auto-discard stale stall drafts + invoke reply trigger |

## End state

Every AI-drafted email that actually sends shows up with the `AI-drafted` badge in the Activity tab. Every inbound reply to a stalled proposal automatically queues a contextual response draft in the Actions tab. Once Malik runs the 90-day backfill, 437 leads retroactively get their full email history rendered inside the deal room. The email intelligence layer is fully closed out.

