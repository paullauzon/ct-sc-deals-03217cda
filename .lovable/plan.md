

# What truly remains across the whole system — full sweep

Email/Gmail is done. Digging into the live DB and codebase, here's what's actually unfinished — sorted from "blocks production" to "polish."

## Verified state right now (live DB)

| Check | Count | Status |
|---|---|---|
| Active leads | 150 | baseline |
| AI-tier enrichment (`firm_aum`/`deal_type`/`transaction_type`) | **0 / 150** | banner exists, never clicked across 10+ sessions |
| Active leads missing LinkedIn URL | **200** (was 55 in session 9) | button exists, never clicked |
| Active leads missing `company_url` | 122 | button exists, never clicked |
| Pending tasks already overdue | **556** | reschedule button exists, never clicked |
| Late-stage leads missing forecast fields | 4 | UI nudge present, awaiting rep entry |
| Stale Fireflies transcripts (`transcript_len = 0`) | 4 | needs Fireflies re-fetch path |
| Auth / login | **none** | RLS is `true/true` on every table |
| Outlook deep sync | dormant | needs `MICROSOFT_OUTLOOK_API_KEY` + admin consent |

## Pattern: every "open" item is a button that nobody clicks

10 sessions of audits show the same root cause — fixes ship as one-click buttons inside the app that depend on a human noticing a banner. The honest fix is **automate the buttons via cron**, so coverage rises whether or not anyone clicks anything.

---

## Work item 1 — Authentication (CRITICAL — biggest unaddressed gap)

The app has zero auth. `App.tsx` wraps routes with no `Session` provider. Every table's RLS is `using (true) with check (true)`. Anyone with the published URL has full read+write to leads, emails, tokens, refresh tokens — the entire CRM.

**Build:**
- Add Supabase email/password + Google sign-in. New `src/pages/Auth.tsx` — sign-in + sign-up tabs.
- Wrap `<Routes>` with a session guard — redirect to `/auth` when no session, show app when authenticated.
- New `profiles` table (id = auth.uid, name, email, default_brand) auto-created via on-auth-insert trigger.
- New `user_roles` table + `app_role` enum (`admin`, `rep`) + `has_role(uid, role)` SECURITY DEFINER function — per the project's role pattern.
- Tighten RLS on every table to `authenticated` only (still permissive within the team — single-tenant, no per-user split yet).
- Auth requirement does NOT apply to webhooks: `ingest-lead`, `ingest-email`, `ingest-calendly-booking`, `track-email-open`, `track-email-click` keep `verify_jwt = false`.
- Edge functions invoked from the UI (`backfill-*`, `bulk-*`, `process-*`, `summarize-*`, `send-gmail-email`) get `verify_jwt = true` so only authenticated reps can trigger them.

This is the single highest-value remaining change. Without it, "publish the URL" effectively means "make the CRM public."

---

## Work item 2 — Cron-automate the buttons that nobody clicks

All five gaps below already have working code paths invoked via UI buttons. Wire them to cron so coverage rises automatically.

| Cron | Schedule | Calls | Cap per run |
|---|---|---|---|
| `auto-enrich-ai-tier` | every 30 min, 09:00–18:00 weekdays | `bulk-enrich-sourceco` `{limit:10, onlyEmptyAum:true}` | 10 leads |
| `auto-backfill-linkedin` | daily 02:00 UTC | `backfill-linkedin` `{}` | 25 leads |
| `auto-backfill-company-url` | daily 02:30 UTC | new helper that derives URL from email domain | 50 leads |
| `auto-reschedule-overdue` | daily 06:00 UTC | bulk update `lead_tasks.due_date = current_date` where overdue & status='pending' | unlimited |
| `auto-process-stale-transcripts` | daily 03:00 UTC | `bulk-process-stale-meetings` `{limit:5}` | 5 leads (TPM-safe) |

All five use existing edge functions; only schedule + ~30 lines of `pg_cron.schedule()` in a migration. Banners in the UI stay (so reps still see real-time state) but progress no longer depends on clicks.

**Cost ceiling:** caps prevent runaway spend. AI-tier cron at 10 leads × 18 ticks/day × $0.02 ≈ $3.60/day max, only running until the queue empties.

---

## Work item 3 — Recover broken Fireflies transcripts (4 leads)

Four leads have `firefliesId` populated but `transcript_len = 0` (transcript fetch failed at sync time). Currently dead-end — `bulk-process-stale-meetings` skips them because there's nothing to summarize.

**Build:**
- Extend `fetch-fireflies` with a `mode='re-fetch'` that takes a list of `firefliesId`s and re-pulls transcript + sentences from the Fireflies API, then writes them back into the meeting JSON.
- One-shot dropdown item in Pipeline header: "Re-fetch broken transcripts (4)".
- After re-fetch, the existing stale-transcripts cron (Work item 2) picks them up next tick.

---

## Work item 4 — Outlook deep email sync (unblock SourceCo)

Code path is fully built (`sync-outlook-emails`, the OAuth equivalents, gateway integration). Two blockers:
1. `MICROSOFT_OUTLOOK_API_KEY` secret not set.
2. SourceCo M365 tenant admin consent not granted.

Both are external. **No code work possible until both are resolved** — but I'll add a one-time setup checklist component in Settings → Mailboxes that shows the exact admin-consent URL to request and the connector setup steps, so the moment those land, the rest of the wiring is one click. Otherwise SourceCo emails stay invisible.

---

## Work item 5 — Per-user mailbox ownership / RLS (Gap G, decision needed)

Originally deferred pending product decision. With auth landing in Work item 1, the call is overdue. Two options:

- **Option A — Single shared inbox view (simpler):** all authenticated team members see all connected mailboxes. RLS = `authenticated` only. Done in Work item 1.
- **Option B — Per-rep ownership (adds friction):** each rep sees only their connected mailbox; admins see all. Requires `user_id` column on `user_email_connections` + RLS conditioning on `auth.uid()` or admin role.

I'll **default to Option A** as part of Work item 1 (lower friction, matches how a 5-person team actually works) and leave a 1-line comment in the migration showing how to flip to Option B later.

---

## What I am explicitly NOT doing

- **A/B subject testing, smart-send-time, AI thread digests** — premature; let templates + clicks accumulate data first.
- **Mobile responsive deal room redesign** — out of scope; current desktop-first is fine for an internal CRM.
- **Multi-tenant org separation** — overkill for a 5-person team on one Lovable project.
- **Stripe / billing for the CRM itself** — internal tool, not a SaaS product.
- **Real-time presence indicators** — nice-to-have, no current pain.

## Order of execution (single focused pass)

1. **Auth (Work item 1)** — can't ship anything else securely until this lands.
2. **Five crons (Work item 2)** — single migration, eliminates 5+ persistent operational gaps in one shot.
3. **Stale transcript re-fetch (Work item 3)** — one new function + one dropdown item.
4. **Outlook setup checklist (Work item 4)** — small Settings component, no logic.
5. **Per-user RLS decision baked into Work item 1** — Option A by default.

After this pass, the system runs itself: data fills automatically, the URL is no longer publicly accessible, and the only manual rep work left is real selling.

## Files / migrations

| File | Change |
|---|---|
| `src/pages/Auth.tsx` (new) | Sign-in / sign-up screen, Google OAuth + email/password |
| `src/App.tsx` | Wrap routes in `SessionGuard`, add `/auth` route |
| `src/contexts/AuthContext.tsx` (new) | `useAuth()` hook, session subscription |
| `src/components/MailboxSettings.tsx` | "Outlook setup checklist" sub-section |
| `supabase/migrations/<ts>_auth_and_rls.sql` (new) | `profiles`, `user_roles`, `app_role` enum, `has_role`, tighten RLS on all tables |
| `supabase/migrations/<ts>_automation_crons.sql` (new) | 5 pg_cron jobs |
| `supabase/functions/auto-backfill-company-url/index.ts` (new) | Derive URL from email domain for active leads |
| `supabase/functions/auto-reschedule-overdue/index.ts` (new) | Bulk push overdue pending tasks to today |
| `supabase/functions/fetch-fireflies/index.ts` | Add `mode='re-fetch'` for broken transcripts |
| `src/components/Pipeline.tsx` | Dropdown item "Re-fetch broken transcripts (4)" |
| `supabase/config.toml` | `verify_jwt = true` on rep-triggered functions; keep `false` on webhooks |

End state: the CRM is auth-protected, fills its own coverage gaps via cron, recovers broken transcripts, and SourceCo Outlook is one admin click away from working.

