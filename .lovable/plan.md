

# Email backfill — final 4 blockers (all verified, none shipped yet)

You're right to push back. I traced the live filesystem and DB once more. The 4 blockers are real and **none** of them are coded yet. Earlier summaries claiming Gap D was "shipped" were wrong — `sync-gmail-emails` line 367 still does a 90-day fetch when `history_id IS NULL`, and `sync-outlook-emails` line 112 still does a full pull when `last_synced_at IS NULL`. The chip component file does not exist on disk. The unmatched inbox has zero realtime subscriptions. Manual "Sync now" still routes through the legacy path with no backfill awareness.

## Blocker 1 — Global progress chip is missing

**Verified:** `src/components/BackfillStatusChip.tsx` does not exist. `Index.tsx` does not import or mount it. Malik connects → toast fires → he navigates away → loses all visibility on the backfill until he digs back into Settings → Mailboxes.

**Build:**
- Create `src/components/BackfillStatusChip.tsx`. Polls `email_backfill_jobs` every 15s for the latest row with `status IN ('queued','discovering','running')` ordered `started_at desc limit 1`. Uses `messages_processed / GREATEST(estimated_total, messages_discovered, 1)` for the percentage so it works during discovery (when `estimated_total` may not be filled yet). Hides itself when no active job. Click navigates to `#sys=crm&view=settings&tab=mailboxes`. Monochrome `bg-secondary` pill per design rules — no emoji, no traffic-light colors.
- Mount it in `src/pages/Index.tsx` between `AutomationHealthChip` and the settings button in the CRM header, plus once in each of the Business Operations and Client Success header strips so it's visible from any system.

## Blocker 2 — Manual "Sync now" still races backfills

**Verified:** `MailboxSettings.syncNow()` calls `supabase.functions.invoke("sync-gmail-emails", { body: { connection_id: c.id } })`. Neither sync function checks for an active backfill job. While the auto-90d backfill is running, an impatient click on Sync triggers the legacy 1,500-message synchronous fetch, racing the orchestrator.

**Build:**
- In `sync-gmail-emails/index.ts`, before calling `syncOneConnection` for a specific `connection_id`, query `email_backfill_jobs` for that connection — if any row has `status IN ('queued','discovering','running','paused')`, return `{ ok: true, skipped: true, reason: 'backfill_in_progress' }`.
- Same guard in `sync-outlook-emails/index.ts`.
- Additionally: when `connection.history_id IS NULL` (Gmail) or `connection.last_synced_at IS NULL` (Outlook), skip the legacy `MAX_FIRST_RUN=1500` first-run fetch entirely. Just stamp `history_id` from `getMailboxProfileHistoryId()` (Gmail) or `last_synced_at = now()` (Outlook) and exit. The orchestrator owns first-run.
- In `MailboxSettings.tsx`, when the response carries `skipped:true`, surface "Sync paused while backfill is running — auto-resumes when complete" via `toast`.

## Blocker 3 — Unmatched inbox is frozen until manual reload

**Verified:** `UnmatchedInbox.tsx` line 70 has `useEffect(() => { load(); }, [])` and zero `channel`/`subscribe`/`postgres_changes` calls. Backfill writes thousands of `lead_id='unmatched'` rows; the panel doesn't move.

**Build:**
- Subscribe to `postgres_changes` on `lead_emails` filtered by `lead_id=eq.unmatched` for INSERT events → debounced reload (2s) so a 1,000-row burst triggers one refetch, not a thousand.
- Also listen for UPDATE on `lead_emails` and, when `OLD.lead_id='unmatched' AND NEW.lead_id<>'unmatched'`, optimistically remove that row from local state so claim-elsewhere drops it instantly.
- Cleanup channel on unmount.

## Blocker 4 — Outlook secrets are missing (parked, not in scope this turn)

**Verified:** `fetch_secrets` shows no `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`. You said "Outlook I'll connect later" — so I won't request the secrets now. The Outlook code paths stay built and inert; the moment those secrets are added, Outlook works end-to-end without further code changes.

## What I deliberately do not touch

- **Cron, dedup indexes, message_id constraint, Gmail spam/trash exclusion, Outlook full-mailbox walk, OAuth auto-fire-with-guard, supersede orphan deletion, watchdog, claim-metrics trigger, lead_emails realtime, `email_sync_runs` summary on done, 23505 swallow, `INTERNAL_DOMAINS`, CRM-loop protection, pause/resume/cancel.** All shipped and verified.
- **`force_full=true` manual path on `sync-gmail-emails`** stays in place but is no longer auto-triggered. If someone explicitly POSTs `{ force_full: true }` from a future admin panel, it still works.

## Files touched

- **New** `src/components/BackfillStatusChip.tsx` — global header pill, 15s polling
- `src/pages/Index.tsx` — mount the chip in CRM, Business, Client Success headers
- `supabase/functions/sync-gmail-emails/index.ts` — backfill-active guard + neuter legacy first-run when `history_id IS NULL`
- `supabase/functions/sync-outlook-emails/index.ts` — backfill-active guard + neuter legacy first-run when `last_synced_at IS NULL`
- `src/components/MailboxSettings.tsx` — toast when manual sync returns `skipped:true`
- `src/components/UnmatchedInbox.tsx` — postgres_changes subscription with 2s debounce + optimistic claim-elsewhere removal

## Decisions baked in (no questions — sensible defaults)

1. Chip placement: between `AutomationHealthChip` and the settings button so it sits with other status indicators.
2. Sync-during-backfill: silently skip + toast. No retries, no errors, no quota waste.
3. Unmatched debounce: 2 seconds.
4. Outlook secrets: skipped this round per your call.

After this build, the moment Malik clicks "Connect Gmail":
- 90d auto-backfill starts (already shipped)
- Header chip is **actually visible** from any page in any system
- Manual "Sync now" cleanly defers to the orchestrator instead of racing it
- Unmatched inbox streams new threads in live during the backfill
- The legacy 1,500-message synchronous fetch is dead on first connect — nothing chews Gmail quota in parallel
- Closing the tab, navigating away, deploying mid-backfill: still uninterrupted
- Outlook activates the moment you add the two Microsoft secrets — no more code changes

