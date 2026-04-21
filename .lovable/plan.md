

# Malik's Gmail is connected — here's what's already running and what to do next

## What's already happening automatically (no action needed)

| System | State | Evidence |
|---|---|---|
| OAuth connection | Active · `m.hayes@captarget.com` | Row in `user_email_connections`, `is_active=true` |
| 90d backfill | **Running** (kicked off automatically by `gmail-oauth-callback`) | Job `66ac353e…` · status `running` · 4,620 messages discovered |
| Discovery cron (finds message IDs) | Ticking | `backfill-discover` logged 4,000 + 620 msgs at 16:16 |
| Hydration cron (fetches bodies + matches to leads) | Ticking every minute | `backfill-hydrate-every-minute` · last tick processed 200 |
| Incremental sync (new inbound after today) | Every 10 min | `sync-gmail-emails-10min` cron is `active=true` |
| Token refresh | Automatic | `refresh-gmail-token` runs server-side |

**Queue right now:** 127 done · 73 skipped (dupes / CRM loop) · **4,420 pending**. At ~200/minute hydration, full drain lands in **~22 minutes**.

## The real problem to solve: match quality, not sync coverage

Looking at the existing connection (`id@captarget.com` · already drained):
- 98 emails **matched** to leads
- 128 emails **unmatched** → sitting in the Unmatched Inbox

That's a **43% match rate**. Acceptable but not great — and once Malik's mailbox drains, the unmatched count will jump by roughly 3-5x because his personal inbox will have more 1:1 prospect threads than the shared `id@` inbox.

So the "what next" isn't "turn on sync" (it's on). The work is:

## Plan — 3 things, in order

### 1. Verify the live drain + surface it to Malik (5 min)

Confirm the backfill is moving and make the progress visible. The existing `BackfillProgressPanel` polls every 5s — we just need to make sure Malik can see his mailbox's row.

- Open Settings → Mailbox → confirm Malik's "Malik Inbox" connection card shows the blue "Backfilling · 127/4,620" pill with live progress
- If the panel only shows one mailbox, fix it to render one progress row per active job

### 2. Raise the match rate before the flood lands (the real work)

Today's matcher (in `sync-gmail-emails` / `backfill-hydrate`) matches on `from_address` or `to_addresses` exact-equal to a lead's `email`. That misses:

- **Forwarded threads** — lead email buried in body, sender is someone else (e.g. assistant@, noreply@)
- **Secondary contacts** — `leads.secondary_contacts` jsonb holds additional emails per lead, currently ignored by the matcher
- **Stakeholder emails** — `lead_stakeholders.email` is not consulted during matching
- **Domain-level fallback** — if no exact email match, match on `@company-domain` when unambiguous (one lead per domain)

Fix the matcher in `backfill-hydrate` and `sync-gmail-emails`:

```text
Match order (first hit wins):
  1. Exact primary email  (leads.email)          ← current behavior
  2. Exact secondary email (leads.secondary_contacts[*].email)
  3. Exact stakeholder email (lead_stakeholders.email)
  4. Domain fallback: counterparty domain maps to exactly ONE lead
     (skip if ambiguous — stays unmatched for manual review)
  5. Unmatched → Unmatched Inbox (unchanged)
```

Expected lift: 43% → **~70-80%** match rate based on the shape of current unmatched rows.

### 3. Auto-claim pass for Malik's existing unmatched inbox

After the matcher upgrade deploys, run a **one-time re-match sweep** over `lead_emails WHERE lead_id='unmatched'`. The `update_lead_email_metrics_on_claim` trigger already exists and will correctly fire when these rows flip to a real lead_id, so metrics update automatically. No manual janitorial work.

## What Malik sees when this is done

- Each prospect's Deal Room → **Emails tab** lights up with every Gmail thread he's ever had with them (inbound + outbound, last 90 days)
- Pipeline cards show real `last_received_date` / `last_replied_date` signals → powers the "stale" / "hot" urgency badges already in the UI
- Follow-Ups tab surfaces threads where the prospect replied but Malik hasn't → highest-value signal in the whole CRM
- Unmatched Inbox shrinks to the genuinely-unclaimable stuff (generic newsletters, random one-offs)

## Files

- **MODIFY** `supabase/functions/backfill-hydrate/index.ts` — extend matcher: secondary_contacts → stakeholders → domain fallback
- **MODIFY** `supabase/functions/sync-gmail-emails/index.ts` — same matcher upgrade (shared helper inlined in both; edge functions can't share non-`_shared/` code)
- **NEW** `supabase/functions/rematch-unmatched-emails/index.ts` — one-shot sweep over `lead_emails WHERE lead_id='unmatched'`, re-runs the new matcher, flips matched rows (trigger handles metrics)
- **MODIFY** `src/components/BackfillProgressPanel.tsx` — ensure it renders one row per `running` job so Malik sees his own progress alongside the Captarget one
- **MODIFY** `src/components/UnmatchedInbox.tsx` — add "Re-run matcher on all unmatched" button that invokes the new rematch function, with a live count

## What I won't touch

- OAuth flow — working
- Cron schedules — working, already dialed in (10min incremental, 1min hydrate)
- Token refresh — working
- Outlook — not relevant here, Malik is on Gmail



