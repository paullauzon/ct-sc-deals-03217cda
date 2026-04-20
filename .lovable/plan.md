

# What's still broken — verified live, just now

The auth + email infrastructure is solid. The cron-firing fix worked for the 6-per-day jobs that fire every 5–15 min (`process-scheduled-emails`, `process-fireflies-retry-queue`, `sync-fireflies-post-meeting`, `enforce-stage-slas`, `sync-gmail-emails`, plus the daily `nurture-engine`). But the actual **data-coverage gaps haven't moved**, and I've found the exact reason for each.

## Verified state, this minute

| Thing | Reality | Note |
|---|---|---|
| Active leads | 150 | down from 437 last session (some closed/archived) |
| Missing AI-tier enrichment | **150 / 150** | unchanged — `auto-enrich-ai-tier` cron has never produced a `cron.job_run_details` row |
| Missing LinkedIn URL | **55** | down from 200 — backfill ran somewhere, good |
| Missing company_url | **11** | down from 122 — fine, near zero |
| Overdue pending tasks | **556** | unchanged — `auto-reschedule-overdue` has never fired |
| Broken Fireflies transcripts | **110** | unchanged. **109 of 110 have `meetings: []`** — the fix below is targeted at this |
| `cron_run_log` rows | 2 | only the 5-min and 15-min jobs have logged so far |
| `fireflies_retry_queue` | **0 rows** | bootstrap code runs but finds 0 candidates because it scans the wrong field |
| Firecrawl status | unknown | no recent enrich runs to test |

## Gap 1 — Fireflies bootstrap targets the wrong field (109 of 110 leads invisible to it)

Last session I added auto-bootstrap logic to `process-fireflies-retry-queue` that scans broken leads and enqueues them. **It's running every 15 min, finding 0 candidates, and exiting `noop`.** Reason verified live: 109 of the 110 broken leads have `meetings: []` (empty array) — the `firefliesId` lives only inside the `fireflies_url` itself (e.g. `https://app.fireflies.ai/view/Ruslan-and-Malik-Hayes::01JVMTWEF9A4KDDE8KVWQSD6HW...`), not in `meetings[].firefliesId` where the bootstrap looks.

**Fix:** broaden the bootstrap candidate query in `process-fireflies-retry-queue/index.ts`:
- Include leads where `fireflies_url <> ''` AND `LENGTH(fireflies_transcript) < 200` AND `archived_at IS NULL`.
- Extract the firefliesId from the URL by parsing the segment after `::` and before any `?`.
- Also keep the existing `meetings[].firefliesId` path for the 1 lead that does have a meeting record.
- After successful re-fetch, write the transcript back to the lead-level `fireflies_transcript` column (not just `meetings[]`), and append a meeting object if `meetings` is empty.

Effect: next 15-min tick enqueues 30 leads, then 30 more 15 min later, etc. — backlog drains in ~55 min once Firecrawl/Fireflies API is healthy.

## Gap 2 — The 5 daily `auto-*` crons need a manual first-run kick

`auto-enrich-ai-tier` (every 30 min, 13:00–22:00 UTC weekdays), `auto-backfill-linkedin`, `auto-backfill-company-url`, `auto-reschedule-overdue`, `auto-process-stale-transcripts` — all show **zero entries in `cron.job_run_details`**. They're scheduled and `active=true`, but pg_cron hasn't fired them yet either because their daily slot already passed when re-registered, or because today's first slot hasn't hit. Waiting up to 24h is unacceptable when 556 tasks are overdue and 150 leads are unenriched.

**Fix:** Add a one-click "Run all daily automations now" admin button to `AutomationHealthPanel.tsx` that fires all 5 in parallel via `supabase.functions.invoke()`. Reps don't need to wait until tomorrow's UTC slot — admins can drain the backlog in 1 click. The crons stay scheduled for ongoing autopilot.

## Gap 3 — `auto-reschedule-overdue` may be timing out (556 tasks, no log row even on manual trigger)

Need to verify by adding caps. The function should chunk to 200 task-updates per invocation max, log progress, and return early — so even if a single tick hits 1000 overdue tasks, it doesn't statement-time-out.

**Fix:** Add a `LIMIT 500` clause and order by oldest-first in `auto-reschedule-overdue/index.ts`. Subsequent ticks pick up the rest.

## Gap 4 — Firecrawl health is invisible

The `AutomationHealthPanel` already has Firecrawl 403 detection logic, but it's only triggered if a recent `cron_run_log` row contains the marker. With `auto-enrich-ai-tier` never firing, we have no idea if Firecrawl is currently up or down. Reps need to know before clicking "Run now."

**Fix:** Add a tiny "Test Firecrawl connection" button at the top of `AutomationHealthPanel` that pings `https://api.firecrawl.dev/v2/scrape` with a no-op URL and surfaces 200/403/other in real time. Takes ~2s, gives instant ground-truth.

## Gap 5 — Outlook (still externally blocked)

Setup checklist already exists. No code work possible. Mentioning for completeness.

---

## What I'm explicitly NOT doing

- **Per-user mailbox RLS** — Option A (shared) is fine for current 1-user team.
- **Templates analytics, A/B subject testing, smart-send-time** — premature; need send volume.
- **Drop `lead_status` column** — flagged before, low priority, deferred.
- **Outlook deep sync** — externally blocked.
- **Refactor enrich-lead to remove Firecrawl dependency** — fixing the connector is a config action.

## Order of execution (one focused pass)

1. **Fix Fireflies bootstrap** (Gap 1) — biggest unlock; 110 leads start healing within 15 min.
2. **Cap `auto-reschedule-overdue`** (Gap 3) — defensive; ensures it can't timeout.
3. **"Run all daily automations now" button** (Gap 2) — drains the backlog in 1 click.
4. **"Test Firecrawl" button** (Gap 4) — instant visibility into the silent killer.

## Files / changes

| File | Change |
|---|---|
| `supabase/functions/process-fireflies-retry-queue/index.ts` | Broaden bootstrap to scan `leads.fireflies_url` + parse firefliesId from URL; write transcript back to `leads.fireflies_transcript` on success |
| `supabase/functions/auto-reschedule-overdue/index.ts` | Add `LIMIT 500` + oldest-first ordering |
| `src/components/AutomationHealthPanel.tsx` | Add "Run all daily automations" button (fires the 5 daily jobs in parallel) + "Test Firecrawl" button (pings API, shows 200/403/error) |

End state: the 110 broken transcripts begin draining automatically next cron tick (no human action), an admin can drain the entire 556-task / 150-enrichment backlog with one button click instead of waiting 24h, and Firecrawl outages become visible in 2 seconds instead of being silent killers.

