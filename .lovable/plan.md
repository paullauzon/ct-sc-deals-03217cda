

# Fireflies enrichment for 190 leads — background queue, no timeouts

## Current state

- **190 leads** have `calendly_booked_at` linked
- **29** already have full transcripts (≥200 chars)
- **161** are missing transcripts and need enrichment (132 Captarget + 29 SourceCo)
- Date spread: 79 within 90d, 43 within 1y, 24 within 2y, 15 older than 2y
- Existing `sync-fireflies-post-meeting` only handles a 10-min–2hr window (recent bookings only) — won't scale to historical backfill
- `fetch-fireflies` already supports multi-signal matching (email, name, domain, company) with nickname maps and a 1000-transcript scan cap per call

## The 3 hard constraints

1. **Edge function wall-time = 100s** — looping over 161 leads inline will time out around lead #15
2. **Fireflies API rate limits** — GraphQL calls are not free; bulk-firing 161 parallel requests will get throttled (429)
3. **Fireflies transcript retention** — older meetings (>1y) may not be in the API anymore, so we'll never get 100% coverage

## Recommended architecture: persistent queue + cron drainer

Mirror the proven `fireflies_retry_queue` + `process-fireflies-retry-queue` pattern that's already shipping. Reuse the same table — no new schema needed.

```text
        ┌───────────────────────────────────┐
        │  POST /enqueue-fireflies-backfill │  ← one-shot kickoff
        │  (scans 161 leads, inserts queue) │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │   fireflies_retry_queue (table)   │  ← 161 pending rows
        └─────────────────┬─────────────────┘
                          │ every 10 min
                          ▼
        ┌───────────────────────────────────┐
        │ process-fireflies-backfill-queue  │  ← NEW cron drainer
        │   - claims 8 rows per tick        │
        │   - searches via fetch-fireflies  │
        │   - writes transcript + intel     │
        │   - on miss: backoff or gave_up   │
        └───────────────────────────────────┘
```

### Why a separate drainer (not the existing retry runner)

The existing `process-fireflies-retry-queue` re-fetches by **known firefliesId** (path: re-fetch). For these 161 leads we DON'T know the firefliesId yet — we have a Calendly booking time + invitee email and need to **search** Fireflies for it. That's a different code path. The new drainer calls `fetch-fireflies` with `searchEmails`/`searchNames`/`searchDomains` + `since`/`until` window of ±48h around `calendly_booked_at`.

## What I'll build

### 1. `enqueue-fireflies-backfill` (new edge function)

One-shot kickoff. Scans all 161 eligible leads, inserts queue rows with `next_attempt_at` staggered 30s apart so the cron drainer picks them up gradually instead of all at once.

- Pulls leads where `calendly_booked_at <> ''` AND transcript missing
- Stores `lead_id`, `meeting_date_iso` (in `last_error` field as JSON metadata, repurposing existing schema), `attempts=0`, `max_attempts=3`
- Skips any already in queue (dedup by `lead_id`)
- Returns count of newly enqueued

### 2. `process-fireflies-backfill-queue` (new edge function, cron'd)

Drainer that ticks every 10 min via pg_cron. Each tick:

- Claims up to **8 rows** (well under the 100s budget @ ~10s per Fireflies search)
- For each: calls `fetch-fireflies` with email/name/domain matchers + 48h window around `calendly_booked_at`
- On match: writes transcript to `fireflies_transcript`, `fireflies_summary`, `fireflies_url`, appends to `meetings[]`, runs `process-meeting` for AI intelligence extraction
- On no match within retention: marks `gave_up` with reason "not_in_fireflies_api"
- On fetch error: exponential backoff (5m → 30m → 2h)
- Logs to `cron_run_log` for Automation Health visibility

### 3. Cron schedule

Add pg_cron entry: `*/10 * * * *` → POST to drainer.

At 8 rows / 10 min = **48 leads/hour** throughput. Full backlog clears in **~3.5 hours** automatically. No timeouts because each tick is bounded.

### 4. Progress visibility

Add a SQL view counting `pending / done / gave_up` so you can monitor: `SELECT status, COUNT(*) FROM fireflies_retry_queue WHERE created_at > now() - interval '1 day' GROUP BY status;`

## Realistic outcome

| Bucket | Leads | Expected hit rate | Reason |
|---|---|---|---|
| Last 90d | 79 | ~80% (63) | Fully retained in Fireflies API |
| 90d–1y | 43 | ~50% (22) | Partial retention, depends on plan |
| 1–2y | 24 | ~20% (5) | Most aged out |
| >2y | 15 | ~5% (1) | Nearly all aged out |
| **Total** | **161** | **~57% (~91)** | |

After the drain: ~120 of 190 leads (63%) will have full transcripts, up from 29 (15%). The remaining ~70 will be marked `gave_up` with a clear reason — those are historical meetings genuinely no longer in Fireflies' API.

## Files I'll create

- `supabase/functions/enqueue-fireflies-backfill/index.ts` — kickoff scanner
- `supabase/functions/process-fireflies-backfill-queue/index.ts` — cron drainer
- `supabase/config.toml` — register both functions
- One SQL migration: pg_cron schedule for the drainer

## What I'm NOT doing

- **No bulk parallel calls** — strict serial drain per tick to respect Fireflies rate limits
- **No UI** — all background, surfaces in existing Automation Health panel via `cron_run_log`
- **No retry beyond 3 attempts** — Fireflies retention is binary; if we miss 3 times the meeting genuinely isn't there
- **Not touching the 77 unmatched-Calendly leads** — those need Calendly link first (separate prior work)

## After this build

You trigger `enqueue-fireflies-backfill` once. Drain runs autonomously over ~3.5 hours. Check progress anytime with the queue counts. No manual intervention, no timeout risk, no rate-limit explosions.

