

# Email intelligence — corrected interpretation of your mockup

## What your annotations actually mean

The blue callouts in the screenshots aren't UI to render — they're **routing rules** telling me which tab owns which email type:

| Your annotation | What it means |
|---|---|
| "Primary home of all emails — sent, received, auto-logged, AI-drafted" | **Activities tab** = single source of truth for every email, merged with notes/calls/meetings/stage changes chronologically |
| "Threaded, one-to-one emails only" | **Email tab** = focused inbox view. Excludes sequences, marketing, auto-logged bulk sends. Reply-first UX. |
| "Where emails live in this record" (on Overview) | **Overview tab** = summary stats only (total touchpoints, last contact date). No email list. Just the headline numbers that tell you "this deal has 14 emails, last one 2 days ago." |

So the rule is: **Activities = everything. Email = 1-to-1 focus. Overview = counts only.** No explainer cards, no dismissible banners. Clean.

## Revised scope

### Phase 1 — Gmail backfill (unchanged)
- `sync-gmail-emails` gets `force_full=true` flag → 90-day sweep ignoring historyId.
- "Backfill 90 days" button per mailbox in Settings.
- Expected outcome: ~300–1000 emails match against existing 437 leads within minutes.
- **Auto-connect for new mailboxes:** already works — cron loops through all active `user_email_connections` every 10 min. Any new OAuth-added mailbox joins the rotation automatically. No extra work.

### Phase 2 — Activities tab = true unified timeline
Replace current Activity tab content:
- Filter chip row: `All · Emails · Meetings · Calls · Notes · Tasks · Stage changes`
- Debounced search box across subject + body_preview + note text
- Per-email row enrichments:
  - Open count pill (`Opened 5×`) with hover tooltip showing last open timestamp
  - Click count pill (`Clicked 2×`)
  - `Replied` chip when thread has an inbound reply
  - `AI-drafted` badge when `ai_drafted=true`
  - Sequence tag (`S6-B`) from `sequence_step` column when populated
  - Attachment count chip
- Inline Reply + Compose from any email row (reuses EmailComposeDrawer)
- Actor name on every row (already wired via `actor_name`)

### Phase 3 — Overview tab (new, minimal)
New first tab. Four stat cards + pinned note + top 2 upcoming tasks. That's it:
- `Stage · N/9 · Xd in stage`
- `Deal value · $X · Forecast Y%`
- `Deal health · Score /100`
- `Touchpoints · N total · last Apr 10`
- Pinned note banner (if any)
- Top 2 upcoming tasks

No explainer cards. No "where emails live" text. Just numbers.

### Phase 4 — Email tab refinements
Keep existing `EmailsSection` architecture; tighten to 1-to-1 focus:
- Header: "Emails with {lead.name}" + `Compose` CTA
- Filter out `email_type IN ('marketing','transactional')` by default
- Thread-level aggregated stats line under each thread subject: `Opened 7× · Clicked 4× · 3 replies · 2 attachments`
- Latest-reply preview line: `Last reply Apr 8: "This is exactly what we're looking for…"` (truncated 120 chars)
- Global `Expand all replies · Collapse all replies` toggle

### Phase 5 — AI drafts triggered by stage + inbox signals
Extend `draft-followup` edge function + add new stage-entry triggers that write to `lead_drafts`:

| Trigger | Draft |
|---|---|
| `Discovery Completed → Sample Sent` | Sample cover note referencing 15 targets + mandate fields |
| `Sample Sent → Proposal Sent` | Proposal cover email pulling deal value + scope |
| `Proposal Sent > 7d silent (no inbound reply)` | Soft nudge; references `stall_reason` if set |
| Inbound reply received on stalled proposal | Draft response using reply context + 80-word rule |
| `Closed Won` | Kickoff email copying Valeria |

Every draft appears as pending card in Actions tab with `Send · Edit · Discard`. Nothing auto-sends. `ai_drafted=true` stamped on send so Activity tab badges it.

## Schema (one migration)

```sql
ALTER TABLE lead_emails
  ADD COLUMN ai_drafted boolean NOT NULL DEFAULT false,
  ADD COLUMN email_type text NOT NULL DEFAULT 'one_to_one'
    CHECK (email_type IN ('one_to_one','marketing','transactional','sequence')),
  ADD COLUMN sequence_step text;

CREATE INDEX IF NOT EXISTS lead_emails_lead_type_date_idx
  ON lead_emails (lead_id, email_type, email_date DESC);
```

## Files touched

| File | Change |
|---|---|
| `supabase/functions/sync-gmail-emails/index.ts` | `force_full=true` → 90-day `messages.list` sweep |
| `supabase/functions/send-gmail-email/index.ts` | Stamp `ai_drafted=true` when body came from `lead_drafts` |
| `supabase/functions/draft-followup/index.ts` | New stage-entry trigger hooks + stall/reply prompts |
| `src/components/MailboxSettings.tsx` | "Backfill 90 days" button per mailbox row |
| `src/components/lead-panel/LeadOverviewTab.tsx` *(new)* | 4 stat cards + pinned note + top tasks |
| `src/components/lead-panel/LeadActivityTab.tsx` | Filter chips + search + enriched email rows |
| `src/components/dealroom/UnifiedTimeline.tsx` | Accept `filter` + `search` props; read new email columns |
| `src/components/EmailsSection.tsx` | Default-filter to 1-to-1; thread-level stat line; reply preview; expand-all toggle |
| `src/components/LeadDetailPanel.tsx` | Mount Overview tab before Activity; default to Overview |
| `supabase/migrations/<ts>_email_flags.sql` | Schema above |

## Rollout order

1. Phase 1 first (backfill) — drains the inbox into existing leads immediately. High signal, zero risk.
2. Phase 2 (Activities tab) — becomes the true home for every comm signal.
3. Phase 3 (Overview tab) — clean landing page.
4. Phase 4 (Email tab polish) — focused inbox view.
5. Phase 5 (AI drafts) — last, because it builds on the filtered timeline signals from earlier phases.

## End state

Overview = numbers. Activities = everything that happened, filterable. Email = 1-to-1 inbox with reply UX. Every new mailbox any teammate connects joins the sync rotation automatically. Every stage change + signal pattern offers an AI draft for review. No explainer cards cluttering the UI — your annotations stayed on the mockup where they belong.

