

# Email backfill — what's actually left, after a deep trace

I traced everything against the live DB and code (not against earlier summaries). All 4 prior blockers shipped correctly: chip exists and is mounted in 3 headers, sync functions guard on active backfill, `MailboxSettings` toasts on `skipped:true`, `UnmatchedInbox` has the postgres_changes subscription with debounce + optimistic claim removal. Cron is firing. Realtime publication includes `lead_emails`. Both metrics triggers are in place.

But there are **3 real residual issues** that will hurt on Malik's first connect — and one that's already fine but worth naming so we stop revisiting it. None of these are speculative; each is grounded in a specific code line or DB row.

## Gap I — Lead matcher misses everyone except the primary email (huge unmatched-inbox bloat)

Live numbers from `leads`: **438 active leads, 58 with secondary contacts, 0 stakeholders with emails.** The matcher in `backfill-hydrate` (line 146) only checks `leads.email` and a domain-fuzzy fallback against `leads.email` / `leads.company_url`. It ignores `leads.secondary_contacts` (a JSONB array of `{name,email,...}`) entirely.

Concrete impact: when Malik backfills 90 days, every email he had with a CFO or attorney attached to a deal — where the CFO's address is in `secondary_contacts` and not the primary `leads.email` — lands in `lead_id='unmatched'`. He'll see hundreds of unmatched threads that *should* have been stitched onto existing deals. He'll look at the result and reasonably conclude "the matcher doesn't work."

**Fix:** Extend `findLeadIdByEmail` in `backfill-hydrate` (and apply the same to `sync-gmail-emails` so live + historical use the same logic):
- After the exact-email check, run a JSONB containment query: `from('leads').or('secondary_contacts.cs.[{"email":"<addr>"}]')` for each candidate. PostgREST supports `cs` (contains) on JSONB array elements.
- Domain-fuzzy stays as the final fallback.

Also: the matcher's domain-fuzzy uses `email.ilike.%@${d}` which silently matches against `leads.email` — fine — but `company_url.ilike.%${d}%` is too loose (matches `acme.com` against company_url `notacme.com.br`). Tighten to a domain-aware match: extract the host from `company_url` once and store/compare exactly. For this turn I'll only add the `secondary_contacts` lookup; the loose-domain issue is real but rarer and risks new false-negatives on URL formats we haven't seen.

## Gap II — Stakeholder matcher is dead weight (0 rows in the table) — confirm we want to skip it

`lead_stakeholders` has 0 rows project-wide. The matcher doesn't check it. Matching against an empty table costs nothing, but it's worth flagging: if you plan to start populating stakeholders, add a third lookup tier in the matcher (`from('lead_stakeholders').eq('email', addr)`). Otherwise this is a no-op.

**Decision:** I'll add the lookup behind a cheap guard so it's free today and works the moment you add data. No question needed.

## Gap III — Progress bar reads 0% during the entire discovery phase

`backfill-discover` only persists `estimated_total` *after* a discovery page returns it (Gmail line 115, Outlook line 179). For Gmail mailboxes with no `q=` filter (i.e. "All time"), `resultSizeEstimate` is missing on the first response and `estimated_total=0` for the entire first cron tick — meaning the chip math `messages_processed / max(estimated, discovered, 1)` shows `0 / 1 = 0%` for the first 30–60 seconds.

The chip already falls back to the literal text "Discovering…" when `messages_processed===0` AND `status==='discovering'`, so this is mostly handled. But once hydration starts (`status='running'`) and a couple hundred messages are processed before discovery has fully written `estimated_total` for huge mailboxes, the percentage briefly jumps above 100% then settles. Cosmetic but jarring.

**Fix:** In `backfill-hydrate` line 525, clamp `messages_processed` to `min(processed, max(estimated_total, messages_discovered))` before writing. The chip and panel already use the same denominator. One line.

## Gap IV — Auto-90d on connect uses a hash-based deep link the chip never produces

The chip writes `#sys=crm&view=settings&tab=mailboxes`. Confirmed `Index.tsx` reads those keys (line 16 imports the chip; the hash routing is already there). So this is fine — flagging it only because earlier plans worried it wasn't. **No fix.**

## What's verified correct (no fix)

- Chip mounted in CRM, Business, Client Success headers ✅
- Sync functions return `{skipped:true, reason:'backfill_in_progress'}` when a job is queued/discovering/running/paused ✅
- `MailboxSettings` toasts "Sync paused while backfill is running" on `skipped:true` ✅
- `UnmatchedInbox` subscribes to `postgres_changes` with 2s debounce on INSERT and optimistic remove on UPDATE → claim ✅
- `lead_emails` is in `supabase_realtime` publication ✅
- Both `trg_update_lead_email_metrics` (INSERT) and `trg_update_lead_email_metrics_on_claim` (UPDATE of lead_id) triggers active ✅
- Discover watchdog: pickJobs re-kicks discover when `last_chunked_at` > 3 min and `discovery_complete=false` ✅
- Self-reschedule chains in discover and hydrate ✅
- All dedup indexes (`uq_backfill_queue_conn_msg`, `uq_lead_emails_provider_message`) ✅
- 23505 swallowed in hydrator ✅
- CRM-loop guards (`X-CRM-Source`, `<crm-` Message-ID prefix) in both hydrators ✅
- `INTERNAL_DOMAINS` filter ✅
- `email_sync_runs` summary on `done` ✅
- Token refresh inline in both functions ✅
- Outlook code paths inert until secrets added — by your call ✅

## Files touched

- `supabase/functions/backfill-hydrate/index.ts` — extend `findLeadIdByEmail` to also check `leads.secondary_contacts` (JSONB `cs`) and `lead_stakeholders.email`. Clamp `messages_processed` ≤ denominator at line 525 (Gap III).
- `supabase/functions/sync-gmail-emails/index.ts` — same matcher extension so live and historical paths agree (Gap I parity).
- `supabase/functions/sync-outlook-emails/index.ts` — same matcher extension (Gap I parity, even though Outlook is parked — keeps logic consistent for the moment secrets are added).

## Decisions baked in (no questions)

1. **Stakeholder lookup**: included as the third matcher tier even though the table is empty today. Free until you populate it; no code change later.
2. **Domain-fuzzy tightening**: deferred. Real but rarer than the `secondary_contacts` miss; needs more design to avoid regressions.
3. **Progress bar clamp**: applied. Cosmetic but Malik-visible.

After this build, the moment Malik clicks "Connect Gmail":
- 90d backfill discovers and hydrates as before
- Emails to/from CFOs, attorneys, and other secondary contacts on existing deals correctly stitch onto those leads instead of dumping into Unmatched
- The progress bar never overshoots 100%
- Everything else (chip, sync deferral, unmatched realtime, claim-metrics, supersede orphan handling) keeps working as already shipped

