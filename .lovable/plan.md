

# What's actually left — verified against the live DB right now

I dug in. Auth landed, RLS is tight, Gmail sync runs every 10 min, email infra (clicks/bounces/replies/scheduled/templates/read-state) is fully wired. **But the "5 automation crons" from the previous plan were never actually scheduled** — only the auth migration ran. The numbers prove it:

| Check | Last session claim | Today's reality |
|---|---|---|
| Active leads | 150 | **437** |
| Missing AI-tier (`firm_aum`/`deal_type`/`transaction_type`) | 0/150 | **0 / 437** (got worse, not better) |
| Missing LinkedIn URL | 200 | **200** (unchanged) |
| Missing `company_url` | 122 | **122** (unchanged) |
| Overdue pending tasks | 556 | **556** (unchanged, oldest from 2025-11-01) |
| Broken Fireflies transcripts | 4 | **110** (got worse — sync failures accumulating) |
| Auth users / profiles | 0 | **1** (Adam — works) |
| Mailboxes | 1 | 1 (Captarget) |
| Email templates seeded | 6 | 6 |

The only cron actually running is `sync-gmail-emails` every 10 min. The five automation crons that were supposed to land last session — `auto-enrich-ai-tier`, `auto-backfill-linkedin`, `auto-backfill-company-url`, `auto-reschedule-overdue`, `auto-process-stale-transcripts` — exist as edge functions but are **never invoked**. Same for `process-scheduled-emails`.

---

## Work item 1 — Actually schedule the automation crons (the real fix)

Schedule six cron jobs against the live DB using `pg_cron` + `pg_net`. Per the `schedule-jobs` guide, these go through the database insert tool (not migrations), because the URLs and service-role key are project-specific.

| Cron name | Schedule | Calls | Cap |
|---|---|---|---|
| `auto-enrich-ai-tier` | every 30 min, 13:00–22:00 UTC, weekdays | `bulk-enrich-sourceco` `{limit:10, onlyEmptyAum:true}` | 10/run → ~180/day |
| `auto-backfill-linkedin` | daily 02:00 UTC | `backfill-linkedin` | 25/run |
| `auto-backfill-company-url` | daily 02:30 UTC | `auto-backfill-company-url` | 50/run |
| `auto-reschedule-overdue` | daily 06:00 UTC | `auto-reschedule-overdue` | unlimited (push to today) |
| `auto-process-stale-transcripts` | daily 03:00 UTC | `bulk-process-stale-meetings` `{limit:5}` | 5/run |
| `process-scheduled-emails-5min` | every 5 min | `process-scheduled-emails` | unlimited |

**Cost ceiling:** AI-tier at 10 leads × 18 ticks × $0.02 ≈ $3.60/day max, only while queue is non-empty. Other crons are essentially free.

**Effect after 7 days:**
- AI-tier coverage: 0 → ~437 (queue drains in 3 days)
- Missing LinkedIn: 200 → ~25 (drains in 8 days)
- Missing company_url: 122 → 0 (drains in 3 days)
- Overdue tasks: 556 → 0 (next morning)
- Broken transcripts: 110 → ~75 (drains in 22 days at 5/day; consider raising cap if fine on TPM)

---

## Work item 2 — Fix the broken transcript explosion (110, was 4 last week)

Root cause: every time a Fireflies meeting is synced, if the transcript fetch fails (rate-limit, timing, etc.), it persists with `transcript_len = 0`. Currently the sync-fireflies-post-meeting job has no retry path.

**Build:**
- In `sync-fireflies-post-meeting/index.ts`: when transcript fetch returns empty, **don't write the meeting yet** — write a row to a small new `fireflies_retry_queue` table with `firefliesId`, `lead_id`, `attempts` (max 5), `next_attempt_at` (exponential backoff: 5min, 30min, 2h, 6h, 24h).
- New cron `process-fireflies-retry-queue` every 15 min — picks up due rows, re-fetches the transcript, on success writes meeting + summarizes, on final failure flags the row `status='gave_up'` so it stops re-trying.
- One-shot **"Repair 110 broken transcripts" dropdown item in Pipeline header** — enqueues all currently-broken leads into the retry queue at staggered times so we don't spike the Fireflies API.

This permanently kills the regression instead of patching it.

---

## Work item 3 — `lead_status` is a dead column (cleanup)

All 437 active leads have `lead_status='Working'`. The column is never set to anything else, never filtered on, never displayed. It's vestigial.

**Build:**
- One small migration: drop `leads.lead_status` column.
- Remove references from `src/types/lead.ts`, `src/lib/leadDbMapping.ts`, anywhere it's selected.
- Trivial; reduces noise.

(Skip if you want — but worth flagging that "Working" everywhere is a tell that this field is dead weight.)

---

## Work item 4 — Cron health visibility

Without it, the same "schedule it and forget" failure mode that hit us this session can repeat silently. Build a small admin-only Settings → "Automation health" panel:

- Lists each of the 6 crons (name, last run time, last success/failure, items processed last run).
- Backed by a new `cron_run_log` table that each automation function writes to on completion.
- Red dot if last run > 1.5× the schedule interval ago.
- Manual "Run now" button next to each cron.

If a cron stops firing or starts failing, it's visible in 5 seconds instead of taking a 10-session audit cycle to discover.

---

## What I'm explicitly NOT doing

- **Outlook (still blocked)** — needs `MICROSOFT_OUTLOOK_API_KEY` + SourceCo M365 admin consent. The setup checklist already exists in Settings → Mailboxes; nothing more is buildable until those land externally.
- **Per-user mailbox RLS (Gap G)** — Option A (shared) is live and working for a 5-person team; defer until you have >5 users or hear a complaint.
- **Templates analytics, A/B subject testing, smart-send-time** — premature; need real data first.
- **Mobile responsive deal room** — out of scope; internal CRM.

---

## Order of execution (single pass)

1. **Schedule the 6 crons** (Work item 1) — biggest impact-per-byte; most of it is one INSERT statement per cron.
2. **Fireflies retry queue + repair-110 button** (Work item 2) — kills the worst regression.
3. **Cron health panel** (Work item 4) — last-mile visibility so this never happens silently again.
4. **Drop `lead_status`** (Work item 3) — quick cleanup if you want it.

---

## Files / changes

| File | Change |
|---|---|
| Direct DB inserts (no migration) | Schedule 6 `pg_cron` jobs via the `insert` path so the project-specific URL+key aren't committed to migrations |
| `supabase/functions/sync-fireflies-post-meeting/index.ts` | Stop writing empty meetings; enqueue to retry queue |
| `supabase/functions/process-fireflies-retry-queue/index.ts` (new) | Retry runner with exponential backoff + give-up |
| `supabase/migrations/<ts>_fireflies_retry.sql` (new) | `fireflies_retry_queue` + `cron_run_log` tables |
| `src/components/Pipeline.tsx` | Dropdown item "Repair 110 broken transcripts" |
| `src/components/AutomationHealthPanel.tsx` (new) | Admin-only health dashboard for the 6 crons |
| `src/components/MailboxSettings.tsx` | New "Automation" tab housing the panel |
| All `auto-*` and `process-*` edge functions | Append a one-line `cron_run_log` insert at the end of each run |
| (Optional) `supabase/migrations/<ts>_drop_lead_status.sql` | Drop the dead column |

End state: AI-tier coverage climbs from 0% to 100% over 3 days unattended; LinkedIn URL backfill drains the 200-lead queue in a week; 556 overdue tasks vanish overnight; broken transcripts self-heal via retry queue; cron failures become visible immediately; the system genuinely runs itself.

