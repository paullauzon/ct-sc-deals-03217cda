

# Email backfill — final 3 issues that will hit Malik on his actual first connect

I traced everything against the live DB and code. The 14+ prior gaps are all coded and verified. But three real issues remain that earlier passes missed because they only show up under the *exact* state Malik is in right now.

## Issue 1 — Malik's existing connection will NEVER auto-backfill (he already has a connection row)

**Live DB state:** `user_email_connections` has exactly one row — `id@captarget.com`, active, `history_id` already set, `last_synced_at = 2026-04-20`. **Zero rows in `email_backfill_jobs`.** The auto-90d-on-connect code only fires when the OAuth callback completes a *fresh* connection. Malik's connection was created before the auto-fire was added, so unless he disconnects + reconnects, he gets zero historical data even though the orchestrator is fully wired.

The earlier "Gap C" fix (skip auto-fire if a prior backfill exists) was the right safety net for *reconnect*, but the inverse problem — existing connections that never had a backfill job — was never addressed. Malik will connect, see no progress chip, see no historical email, and reasonably conclude the system is broken.

**Fix:** A one-shot "auto-enroll" on app load. In `BackfillProgressPanel`'s `loadJob`, after fetching the latest job: if `job === null` AND the connection is active, call `start-email-backfill` with `target_window: "90d"` exactly once. Guard with a `localStorage` key per connection_id so it never re-fires after the first enroll. This guarantees every active connection — past, present, future — gets its 90d auto-backfill exactly once, without depending on the OAuth callback firing.

(Alternative considered and rejected: background SQL trigger on `user_email_connections` insert. Won't help existing rows and adds infrastructure we don't need.)

## Issue 2 — `BackfillProgressPanel.loadJob` doesn't filter out `superseded` jobs

`loadJob` does `.order('started_at', desc).limit(1)` with no status filter. After Malik widens 90d → All time, the new "All time" job becomes the latest — fine. But there's a 200ms window during which the new job is being inserted while the old `superseded` row is still the most recent — the panel briefly renders the superseded job's stale status. Earlier "Gap B" fix promised to filter `superseded` out; the code never got it. Cosmetic but jarring on a high-stakes click.

**Fix:** Add `.not('status', 'eq', 'superseded')` to `loadJob`'s query. One line.

## Issue 3 — `BackfillStatusChip` polling is wasteful when nothing is happening

The chip polls every 15s forever, even on systems where no backfill will ever run (most of the time). On a per-page basis it's cheap, but it's mounted in 3 headers (CRM / Business / Client Success) and any open tab keeps polling. Multiply by all team members × all open tabs and it's 12+ DB hits per minute that return nothing 99% of the time.

**Fix:** Switch the chip from polling to Postgres realtime — subscribe to `email_backfill_jobs` INSERT/UPDATE events and only re-query on actual changes. `email_backfill_jobs` is already in the `supabase_realtime` publication (verified — RLS is `authenticated true`, so realtime works). Falls back to a single load on mount. Eliminates ~99% of the chip's queries.

## What's verified correct (no fix)

- Chip component exists and is mounted in CRM, Business, Client Success headers ✅
- Sync functions correctly defer when a backfill is queued/discovering/running/paused ✅
- `MailboxSettings` toasts "Sync paused while backfill is running" ✅
- `UnmatchedInbox` realtime subscription with 2s debounce + optimistic claim removal ✅
- Lead matcher: 4-tier (exact email → secondary_contacts JSONB cs → lead_stakeholders → domain-fuzzy) ✅ (live in `backfill-hydrate`, `sync-gmail-emails`, `sync-outlook-emails`)
- `messages_processed` clamped to denominator — never overshoots 100% ✅
- Both metrics triggers: INSERT (`update_lead_email_metrics`) + UPDATE-of-lead_id (`update_lead_email_metrics_on_claim`) ✅
- Cron `backfill-hydrate-every-minute` active ✅
- Discover watchdog (3-min stall threshold) re-kicks discover from `pickJobs` ✅
- Self-reschedule chains in discover and hydrate ✅
- Dedup indexes (`uq_backfill_queue_conn_msg`, `uq_lead_emails_provider_message`) ✅
- 23505 swallowed on insert ✅
- CRM-loop guards (`X-CRM-Source`, `<crm-` Message-ID prefix) in both hydrators ✅
- `INTERNAL_DOMAINS` filter excludes captarget.com / sourcecodeals.com ✅
- `email_sync_runs` summary written on `done` ✅
- Token refresh inline in both hydrators ✅
- Outlook code paths inert until secrets added — by your call ✅

## Files touched

- `src/components/BackfillProgressPanel.tsx` — auto-enroll for active connections that have no prior backfill job (Issue 1, with localStorage one-shot guard); add `.not('status','eq','superseded')` to `loadJob` (Issue 2).
- `src/components/BackfillStatusChip.tsx` — switch from 15s polling to `email_backfill_jobs` realtime subscription with one-shot initial load (Issue 3).

## Decisions baked in

1. **Auto-enroll mechanism**: client-side, guarded by `localStorage` key `backfill-auto-enrolled-${connectionId}`. Survives refreshes; never re-fires; one user opening the panel triggers it for everyone. Only fires on `MailboxSettings` view, where the panel actually mounts.
2. **Auto-enroll window**: 90d (matches OAuth-callback default). Malik can widen later from the same panel.
3. **Chip realtime**: subscribe to all events on `email_backfill_jobs`; on any event, re-query the latest active job. Cleanup channel on unmount. Initial load on mount handles cold start.

After this build, when Malik next opens the CRM:
- The panel notices his existing connection has never had a backfill, fires a 90d auto-backfill exactly once, marks itself enrolled
- The chip appears in the header within seconds via realtime (no 15s wait)
- Widening to All time cleanly transitions without the superseded-flicker
- Once complete, the chip disappears and stays disappeared with zero polling overhead

