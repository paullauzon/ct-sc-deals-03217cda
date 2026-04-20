

# What's still broken (verified live, just now) and what to do

Last session's plan shipped, but the live DB tells a more nuanced story than "auth + crons done." Here's what's actually unfinished or silently broken right now.

## Verified state, this minute

| Thing | Reality | Note |
|---|---|---|
| Cron jobs scheduled | 11 | All marked `active=true` |
| **Crons actually firing** | 5 of 11 | Only the pre-existing 4 + `process-scheduled-emails-5min` |
| **Crons silently NOT firing** | 6 | `auto-enrich-ai-tier`, `auto-backfill-linkedin`, `auto-backfill-company-url`, `auto-reschedule-overdue`, `auto-process-stale-transcripts`, `process-fireflies-retry-queue-15min` |
| `cron_run_log` rows | 0 | Logging path never exercised because crons aren't firing |
| Active leads | 437 | unchanged |
| Missing AI-tier enrichment | 437 / 437 | unchanged — cron isn't running, AND when manually triggered, every enrich call errors |
| Missing LinkedIn URL | 200 | unchanged |
| Missing company_url | 122 | unchanged |
| Overdue tasks | 556 | unchanged |
| Broken Fireflies transcripts | 110 | unchanged — repair button exists, retry queue is empty (button never clicked) |
| **Firecrawl scraping** | 403 errors | every `enrich-lead` call fails on Firecrawl auth — silent killer |
| Auth users | 1 | Adam |
| Stakeholders tracked | 85 | healthy |
| Active nurture sequences | 283 | healthy |

## Gap 1 — pg_cron isn't firing 6 of the 11 jobs (silent failure)

`cron.job` shows them scheduled and `active=true`, but `cron.job_run_details` has zero entries for them. `auto-enrich-ai-tier` should have fired at 13:00, 13:30, 14:00 UTC today. It hasn't. `process-fireflies-retry-queue-15min` should have fired every 15 min. It hasn't. Meanwhile `process-scheduled-emails-5min` (created in the same wave) IS firing. This is a known pg_cron pathology — newly-inserted jobs sometimes don't get picked up by the worker until they're re-registered.

**Fix:** drop and re-create the 6 dormant jobs in a single SQL block. They re-register cleanly when removed and re-added.

## Gap 2 — Firecrawl auth is broken (403 on every scrape)

`enrich-lead` logs show `ERROR Firecrawl scrape error: 403` on every call. Even when `bulk-enrich-sourceco` ran manually at 14:00, all 10 leads failed. The Firecrawl secret is managed by the connector — likely the connection is expired or revoked.

**Fix:** Re-authenticate the Firecrawl connector. This is a configuration action (not a code change) — I'll surface a clear notice in the Automation Health panel and in the AI-tier banner so the team can re-connect Firecrawl in one click. Until that happens, scheduling the cron is pointless because every run will produce 10/10 errors.

## Gap 3 — `cron_run_log` logging is one-sided

The current logging code path inserts a row only on the success branch in some functions, only on the catch branch in others, and never on the "nothing to do" branch. So even when a cron fires and exits cleanly with zero items processed, the health panel sees nothing and shows "Stale." This was the exact failure mode that hid Gap 1 from view.

**Fix:** standardize a single log call at the top of the response handler in every automation function — always logs, regardless of whether items were processed, including a "noop" status when there was no work.

## Gap 4 — 110 broken transcripts haven't been enqueued

The "Repair 110 broken transcripts" dropdown item exists in `Pipeline.tsx`, but it's a manual button that nobody has clicked. The retry queue is empty. Even if the retry cron was firing, it would have nothing to retry.

**Fix:** Add a one-shot **auto-bootstrap** to the retry-queue cron: on its first run after Fireflies repair is enabled, it auto-enqueues any lead with `fireflies_url` set and an empty transcript, capped at 30 leads per cron tick to stay within Fireflies API limits. After that, it returns to normal retry-queue draining behavior. This eliminates the "button nobody clicks" failure mode.

## Gap 5 — `lead_status` is still vestigial

437 / 437 active leads have `lead_status='Working'`. Never read, never filtered on, never set to anything else. Was deferred last session.

**Fix:** Drop the column; remove the 4 references in `src/types/lead.ts` and `src/lib/leadDbMapping.ts`.

## Gap 6 — Outlook is still blocked externally

`MICROSOFT_OUTLOOK_API_KEY` not set; SourceCo M365 admin consent not granted. Setup checklist already exists in Settings → Mailboxes. **No code work possible until externals land.** Mentioning for completeness only.

---

## What I am explicitly NOT doing

- **Per-user mailbox RLS (Gap G)** — Option A (shared) is working for a 5-person team; revisit only when there are more users or a complaint.
- **Templates analytics, A/B testing, smart-send-time** — premature; need real send volume first.
- **Outlook deep sync** — blocked on external admin consent.
- **Refactoring Firecrawl out of `enrich-lead`** — fixing the connector is a config action, not an architecture change.

## Order of execution (one focused pass)

1. **Re-register the 6 dormant crons** (drop + re-schedule via the insert tool) — biggest blocker; everything depends on this.
2. **Standardize `cron_run_log` insertion** in every automation function (single helper, single place) so the health panel becomes trustworthy.
3. **Auto-bootstrap broken transcripts** in `process-fireflies-retry-queue` — repairs the 110 without anyone clicking anything.
4. **Surface Firecrawl-broken state** in the Automation Health panel + AI-tier banner with a "Reconnect Firecrawl" affordance.
5. **Drop `lead_status`** column + remove the 4 code references.

## Files / changes

| File | Change |
|---|---|
| Direct SQL inserts | `cron.unschedule` + re-`cron.schedule` for the 6 dormant jobs |
| `supabase/functions/_shared/cron-log.ts` (new) | Single `logCronRun(name, status, items, details, error?)` helper |
| All `auto-*` and `process-*` functions | Replace inline log inserts with the shared helper; ensure every code path logs once |
| `supabase/functions/process-fireflies-retry-queue/index.ts` | On entry, if queue is empty AND there are leads with broken transcripts, auto-enqueue up to 30 with staggered `next_attempt_at` |
| `src/components/AutomationHealthPanel.tsx` | Add "Firecrawl status" row pulling from a recent `cron_run_log` error pattern; show "Reconnect" link when 403s detected |
| `supabase/migrations/<ts>_drop_lead_status.sql` (new) | `ALTER TABLE leads DROP COLUMN lead_status;` |
| `src/types/lead.ts`, `src/lib/leadDbMapping.ts` | Remove `lead_status` references |

End state: all 11 crons actually fire, every run is recorded in `cron_run_log` so the health panel reflects truth, broken transcripts heal themselves automatically, the Firecrawl outage is visible the moment it happens, and dead schema is cleaned up. After this, the automation layer is genuinely self-running and self-reporting.

