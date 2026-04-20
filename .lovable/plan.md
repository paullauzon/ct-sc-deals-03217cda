

# Email backfill — final 4 gaps before Malik connects

The architecture is end-to-end functional. Cron is firing every minute. All previously identified gaps (A–E) are coded. I traced the live DB and the four edge functions one more time. **Four remaining issues** will cause real pain on Malik's first connect. All are surgical.

## Gap 1 — Hydrate worker silently skips non-running jobs but never resumes them

`pickJobs` only selects jobs with `status IN ('running','discovering')`. The inner loop has another guard: `if (job.status === "paused" || job.status === "cancelled") continue;` — that's dead code (those statuses can't reach it). But the **real** problem: a job created with `status='discovering'` whose discovery has finished sets `status='running'` correctly, but if discovery dies mid-flight (network blip, function timeout), the job stays at `status='discovering'` with `discovery_complete=false` and **no queue rows yet**. The cron picks it up, finds zero pending rows, marks it processed, and moves on — discovery never restarts.

**Fix:** In `backfill-hydrate`'s `pickJobs`, when a job's status is `discovering` AND `discovery_complete=false` AND `last_chunked_at` is older than 3 minutes, re-dispatch `backfill-discover` for it before processing. Cheap watchdog. One extra check, no schema change.

## Gap 2 — Lead-side email tab won't show backfilled history until a manual refresh

`EmailsSection` subscribes to `postgres_changes` filtered by `lead_id=eq.${leadId}`. Live realtime works for new sends. But the backfill writes thousands of rows per minute via the service role, and `lead_emails` is **not in the `supabase_realtime` publication** (verified: schema dump shows no realtime config for it). So when Malik opens an existing lead mid-backfill, the historical emails won't stream in — he has to close + reopen the lead panel to see them.

**Fix:** One-line migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_emails;` and `ALTER TABLE public.lead_emails REPLICA IDENTITY FULL;` so UPDATE/DELETE deltas carry the lead_id needed by the filter. Now backfilled emails appear in the open lead panel as they land.

## Gap 3 — `messages_processed` counter overcounts on resume, breaks progress %

In `backfill-hydrate` line 494: `messages_processed: (doneCount || 0) + (skippedCount || 0)`. This is the **total** done+skipped queue rows for the job, recomputed each invocation. Correct on a fresh job. But the **superseded** queue rows from a prior job that the new job re-enqueued are also counted when the new job's queue counts roll over — except they're not, because superseded rows have `job_id` of the OLD job, and the count is filtered by the new `job_id`. So the count is right for the new job alone.

The real bug: when the old job was superseded, we set its queue rows to `status='superseded'` but **the new job re-discovers those same `provider_message_id`s** and the queue UPSERT uses `onConflict: "connection_id,provider_message_id"` with `ignoreDuplicates: true`. That means **the new job's queue will be missing those IDs entirely** — they exist in the queue under the old job's `job_id` (now `superseded`), and the upsert silently rejects re-insertion under the new `job_id`. Result: the new job thinks discovery only found, say, 500 of 8000 messages. `messages_discovered=500`. Progress bar reaches 100% after processing 500 while 7,500 historical messages remain unimported.

**Fix:** In `start-email-backfill`, when superseding, **delete** old jobs' pending queue rows instead of marking them `superseded`:
```sql
DELETE FROM email_backfill_queue WHERE job_id IN (...) AND status='pending'
```
This frees the `(connection_id, provider_message_id)` slot so the new job re-enqueues them under its own `job_id`. Already-hydrated rows in `lead_emails` are protected by `uq_lead_emails_provider_message`, so no dup risk.

## Gap 4 — Per-lead email count + unread badge ignore the `unmatched` lead until claimed

`UnmatchedInbox` queries `lead_id='unmatched'` and lets Malik claim. Good. But two side effects:
1. `update_lead_email_metrics` trigger has `IF NEW.lead_id IS NULL OR NEW.lead_id = 'unmatched' THEN RETURN NEW;` — so unmatched emails never roll up to metrics. Fine.
2. **But when Malik bulk-claims** an unmatched email to a real lead via `UnmatchedInbox.claimToLead` (UPDATE `lead_id`), the trigger only fires on INSERT (verified — `update_lead_email_metrics` is wired to INSERT only on `lead_emails`). So the just-claimed lead's `total_received`, `last_received_date`, etc. **never update**. He'll see the email in the tab but the lead overview metrics, `useUnansweredEmails` count, and "X unread" badges stay stale until something triggers a metrics rebuild.

**Fix:** Add an `AFTER UPDATE OF lead_id ON lead_emails` trigger that, when `OLD.lead_id='unmatched' AND NEW.lead_id<>'unmatched'`, calls the same metrics-upsert logic for `NEW.lead_id`. One small SQL function + trigger. Keeps the metrics live the moment Malik claims.

## What's verified correct (no fix needed)

- Cron `backfill-hydrate-every-minute` active ✅
- All prior 11 gaps (1–6, A–E) shipped ✅
- Self-reschedule chains, dedup indexes, OAuth auto-fire-with-guard, supersede status filter on UI, global header chip, legacy sync neutered on first connect, `email_sync_runs` summary on done, 23505 swallowed, `INTERNAL_DOMAINS` filter, CRM-loop protection, pause/resume/cancel ✅
- Token refresh inline in both workers ✅
- BackfillProgressPanel polls 5s while active, hides superseded ✅

## Files touched

- `supabase/functions/start-email-backfill/index.ts` — DELETE old pending queue rows on supersede instead of marking them `superseded` (Gap 3)
- `supabase/functions/backfill-hydrate/index.ts` — watchdog: when picking a `discovering` job that hasn't chunked in 3min, re-dispatch `backfill-discover` (Gap 1)
- **New migration** `<ts>_lead_emails_realtime_and_claim_metrics.sql`:
  - `ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_emails;` + `REPLICA IDENTITY FULL` (Gap 2)
  - `update_lead_email_metrics_on_claim()` function + `AFTER UPDATE OF lead_id` trigger (Gap 4)

## Decisions before I build (sensible defaults)

1. **Supersede orphan handling**: switch from `mark superseded` to `DELETE pending`. Cleaner — the new job re-discovers under its own `job_id` and progress math works. Already-hydrated rows are safe via `lead_emails` unique constraint.
2. **Discover watchdog threshold**: 3 minutes since `last_chunked_at`. Long enough to never race a healthy in-flight discover, short enough that a stuck job recovers within one cron cycle.
3. **Metrics-on-claim trigger**: increment counters as if the email was just inserted, dated by `email_date`. Matches the existing INSERT trigger's semantics exactly.

After this build, the moment Malik clicks "Connect Gmail":
- 90d auto-backfill starts in the background (already shipped)
- Header chip shows live progress from any page (already shipped)
- He can widen to All time → old job's pending queue rows are deleted, new job re-discovers all IDs cleanly, progress bar tracks correctly (Gap 3)
- If discovery ever stalls, the next cron tick auto-restarts it (Gap 1)
- Already-open lead panels stream backfilled history live (Gap 2)
- Bulk-claiming unmatched threads to leads instantly updates the lead's email metrics, unread counts, and overview tab (Gap 4)
- Closing the tab, navigating away, deploying mid-backfill: still uninterrupted

