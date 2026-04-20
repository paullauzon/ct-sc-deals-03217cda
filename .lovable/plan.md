

# Close out the master plan: drain backlogs, heal dormant crons, final polish

## Ground truth, verified live right now

| Metric | Value | Interpretation |
|---|---|---|
| Active leads | 437 | real current count (previous "150" was wrong) |
| Missing AI enrichment | 437 / 437 | none completed — `auto-enrich-ai-tier` ran 4× but 0 items processed |
| Missing LinkedIn URL | 200 | `auto-backfill-linkedin` has never logged a run |
| Missing company_url | 122 | `auto-backfill-company-url` has never logged a run |
| Overdue pending tasks | 556 | `auto-reschedule-overdue` has never logged a run |
| Broken transcripts | 81 (down from 110) | Fireflies bootstrap is working, 29 healed |
| Fireflies retry queue | 1 pending / 29 done | draining as expected |
| Crons with run rows | 3 of 7 | 4 daily crons silently not firing |
| Activities with actor | 0 / 1765 | expected — all predate actor migration |

## What's already shipped (don't re-do)

Auth screen · Google OAuth · email signup · first-user-admin · `/profile` (name, brand, provider, last sign-in, initials) · `/settings/team` with invite dialog + magic-link edge function · `UserMenu` in all three systems · actor columns on `lead_activity_log` · actor stamping in `logActivity` · actor rendering in `UnifiedTimeline` (which is what `LeadActivityTab` embeds) · `AutomationHealthPanel` with "Run all daily" + "Test Firecrawl" buttons · Fireflies URL-based bootstrap · `auto-reschedule-overdue` capped at 500.

## What remains — four targeted fixes

### 1. The "Run all daily" button isn't draining the backlog

`auto-enrich-ai-tier` has logged 4 runs but processed **0 items** each time. That means either the upstream function (`bulk-enrich-sourceco`) returns early (its filter is `onlyEmptyAum`, which likely narrows to SourceCo leads only — most of our 437 active leads are Captarget), or the AI-tier field check is wrong for Captarget leads.

Meanwhile `auto-backfill-linkedin`, `auto-backfill-company-url`, `auto-reschedule-overdue`, `auto-process-stale-transcripts` have **never written a row** to `cron_run_log`, meaning either pg_cron hasn't fired them in their daily window, or the endpoint fails before reaching the logger.

**Fix:**
- Broaden `auto-enrich-ai-tier` to also run against Captarget leads missing enrichment (not just SourceCo). Change the admin-panel "Run all daily" call to target `enrich-lead` + bulk-enrich across both brands, with a 50-lead cap per tick.
- Add a "Run one" button per job row in `AutomationHealthPanel` so we can verify each daily function works in isolation. Each click invokes the single endpoint and surfaces errors inline. This flushes the "never logged" mystery in one minute instead of waiting 24h.
- Wrap every daily edge function's try/catch so that even on error the function writes a `cron_run_log` row with `status='error'` + the error message. Today a silent crash leaves no trace.

### 2. Drop the dead `lead_status` column (deferred twice, finally ship it)

Original plan had this as "low priority." `lead_status` defaults to `"Working"` on every row and no code reads it in any meaningful branch — `stage` is the source of truth. Leaving it in keeps the DB schema confusing.

**Fix:** Migration `ALTER TABLE leads DROP COLUMN lead_status;` — remove from `src/types/lead.ts`, `src/lib/leadDbMapping.ts`, and any stale references. Auto-regenerated types pick up the change.

### 3. Backfill `actor_name` = 'System' for pre-migration rows so the UI reads cleanly

All 1765 existing `lead_activity_log` rows show as "by —" because `actor_name` is empty string. The UI falls back to "System" if the column is `null`, but `actor_name` is `NOT NULL DEFAULT ''`, so the null-check never triggers.

**Fix:** One-line migration `UPDATE lead_activity_log SET actor_name = 'System' WHERE actor_name = '' AND actor_user_id IS NULL;` — instantly rebrands all historical rows as attributable to the system itself.

### 4. Small Admin nav surface for health visibility

The automation panel lives inside Mailbox Settings → Automation tab, 3 clicks deep. For an admin, that's too buried when the system has 556 overdue tasks. Add a tiny health chip in the main nav next to `UserMenu`: "⚡ 7/7" (green) or "⚡ 3/7" (amber) — clickable, goes straight to the automation tab. Admin-only.

## Files touched

| File | Change |
|---|---|
| `src/components/AutomationHealthPanel.tsx` | Per-job "Run now" button on every row; dual-brand logic for `auto-enrich-ai-tier` |
| `supabase/functions/auto-backfill-linkedin/index.ts` | New/confirmed: wrap in try/catch, always write `cron_run_log` row |
| `supabase/functions/auto-backfill-company-url/index.ts` | Same error-log guarantee |
| `supabase/functions/auto-process-stale-transcripts/index.ts` | Same error-log guarantee |
| `supabase/migrations/<ts>_cleanup.sql` (new) | Drop `lead_status`; backfill `actor_name='System'` for old rows |
| `src/types/lead.ts`, `src/lib/leadDbMapping.ts` | Remove `lead_status` references |
| `src/components/AutomationHealthChip.tsx` (new) | Tiny nav chip showing "N/7 crons healthy" |
| `src/pages/Index.tsx` | Mount `<AutomationHealthChip />` next to `<UserMenu />` (admins only) |

## Order of execution

1. Drop `lead_status` + backfill `actor_name` (cleanup migration, no risk).
2. Guarantee every daily edge function writes a `cron_run_log` row even on error (makes the next step debuggable).
3. Per-job "Run now" buttons — click each, see which fails and why.
4. Fix `auto-enrich-ai-tier` brand filter so it actually touches Captarget leads.
5. Nav health chip — final polish once data flows.

## End state

Every daily cron is either confirmed-working or has a visible error row — no more silent failures. Admins see a health chip in the top nav and can click to investigate in 1 action. Historical activities attribute to "System" instead of blank. Dead columns removed. The 437/437 AI enrichment backlog starts actually draining because the function now targets the right leads.

