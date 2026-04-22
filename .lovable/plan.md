

# What's still missing — deep email-attribution audit (round 3)

I just re-ran the system-wide probes. Three classes of issues remain that the previous plans never touched, plus one outright **regression I introduced** in the duplicate-cleanup step. Surfacing all of them:

## Critical — I broke 38 emails yesterday

When we "moved emails from duplicates to canonicals", the canonical IDs we wrote were **CT-012 / CT-039 / CT-055 — which don't exist as leads**. The duplicate records (SC-I-004 / SC-I-013 / SC-I-016) had stale `duplicate_of` pointers. So:

- 14 emails are now attached to lead IDs with no parent row
- Plus 24 more from earlier merges → 38 total orphan-pointing emails
- Their metric rows likewise live under nonexistent IDs
- They show up nowhere in the UI because no deal-room exists

**Fix:** Resolve the real canonical for each source duplicate by `email` (Jay Lax, Vidushi Gupta, Jack Harvey). Re-route the 14 emails. Find the other 24 (probably similar bad pointers) and fix those too. Update the `duplicate_of` columns on SC-I-004/013/016 to the correct IDs so the in-memory matcher's `resolveCanonical()` stops sending future emails to ghost leads.

## Real attribution bugs the audit found

### A) 16 external-sender misroutes

Tim Murray (`@conniehealth.com`, his own lead is CT-179) has emails stapled to CT-004. Mahdi (`@tpbooker.com`, his own lead CT-356) is stapled to CT-408. Vanholt → wrong lead. Paneja → wrong lead. These are the classic "person who is their own prospect got grabbed by someone else's secondary contact list."

**Root cause:** the matcher's two-pass primary-vs-secondary logic works correctly for *new* emails, but historical rows that were assigned **before** the primary-precedence fix went in are still misrouted. Same pattern as the Boyne/Benjamin Parrish bug, just spread across 16 emails on 4 senders.

**Fix:** one-shot SQL — for any `lead_emails` row whose `from_address` exactly equals an active lead's primary `email`, and whose current `lead_id` is a *different* active lead, move it to the sender's own lead. Trigger handles metric reconciliation.

### B) 3 threads split across multiple lead_ids

Same `thread_id`, different `lead_id`s. Means a Reply-All started a new conversation that the matcher routed to a second deal. The conversation is now visually broken in both deal rooms.

**Fix:** for each split thread, count which `lead_id` owns the majority of messages and consolidate. Surface a warning if neither side dominates (rare).

### C) 5 shared-firm domains still un-disambiguated

`conniehealth.com` (3 leads), `queenscourtcap.com`, `alturacap.com`, `teambigtable.com`, `boynecapital.com` — all have 2+ active leads. Today's matcher refuses domain fallback when multiple leads share a domain, which is correct *defensively* but means real new emails from these firms will sit in the Company Inbox forever instead of being claimed.

**Fix:** Company Inbox already groups by domain, but it doesn't yet expose **disambiguation hints** — when a sender has been on a thread before, suggest the lead they're already associated with. Add a "previously seen on lead X" hint to each row.

## Architectural gaps that will cause the next bug

### D) The `claim-email.ts` shared helper is unused

I created `supabase/functions/_shared/claim-email.ts` two loops ago to enforce participant-overlap on every claim — but **nothing imports it**. The Unmatched Inbox UI, the Company Inbox UI, and `rematch-unmatched-emails` all still write `lead_emails.lead_id` directly. The guard exists in code but doesn't actually guard anything yet.

**Fix:** Add a tiny Deno-deployed RPC edge function `safe-claim-email` that wraps `claimEmailToLead`. Both client UIs call this function instead of raw `.update()`. Manual SQL claims become structurally impossible from any client path.

### E) The noise list is hardcoded — 12,000+ unmatched will keep growing

The current matcher's `NOISE_DOMAINS` set lists ~17 senders. The actual unmatched bucket shows the real concentration: 4,020 webforms.io, 2,054 pandadoc emails, 804 beehiiv, 657 acg.org, 401 zoom.us, 293 investopedia, 206 webflow… These will accumulate forever. No one can review 21K rows.

**Fix:** Add a lightweight `email_noise_domains` table (just `domain TEXT PRIMARY KEY, reason TEXT, added_by`). The matcher reads it on each invocation. The Mailboxes "Email matching" strip gets a "Noise rules" section listing the top 10 unmatched-by-domain so a rep can one-click "always classify this as noise." Future emails from that domain are auto-deleted on arrival rather than piling up.

### F) Auto-purge for old unmatched noise

Even with rule-based noise classification, the existing 21K rows take up space. Add a daily cron that hard-deletes unmatched rows older than 60 days from any domain in the noise list. Keep the recent 60-day window so a human can still rescue something.

### G) Ghost metric rows for nonexistent leads

`lead_email_metrics` can hold rows whose `lead_id` no longer exists in `leads` (we just created some). Add a check constraint or, more practically, a nightly cleanup that deletes orphan metric rows.

## Things I considered but recommend NOT building

- **Manual email-to-lead linking from the deal room** — already exists via the Unmatched Inbox. Adding a second entry point doubles the surface area for the same-firm-different-deal bug.
- **A "merge two leads" UI** — the duplicate_of pointer system already handles this. The bug is that the pointers can be stale, which (G) above covers.
- **Auto-creating a new lead from an unmatched email** — explicitly off-table. Every lead must come through Webflow/Calendly so the qualification fields are populated.

## Execution order (default mode)

1. **Emergency fix** — the 38 orphan-pointing emails. SQL: resolve correct canonical for SC-I-004 / 013 / 016, re-route their 14 emails, find and fix the other 24, repair the `duplicate_of` columns.
2. **External-sender precedence sweep** — 16 emails moved to their sender's own lead via the `claim-email.ts` helper (proves the helper works end-to-end).
3. **Thread consolidation** — 3 split threads merged to majority lead_id.
4. **Wrap claim helper as `safe-claim-email` edge function**, swap both UIs to call it.
5. **`email_noise_domains` table + matcher integration + Mailboxes UI panel** for one-click rule additions; pre-seed with the top 10 domains from the unmatched bucket.
6. **Daily cron: `cleanup-unmatched-noise`** — deletes unmatched rows older than 60d on noise domains; deletes orphan `lead_email_metrics` rows.
7. **Company Inbox enhancement** — add "previously seen on lead X" hint per orphan row to make shared-firm disambiguation a one-glance decision.

Files: 1 new edge function (`safe-claim-email`), 1 new edge function (`cleanup-unmatched-noise`), 1 short migration (new table + cron + RLS), edits to `rematch-unmatched-emails` + `sync-outlook-emails` + `sync-gmail-emails` to read the noise table, edits to `MailboxSettings.tsx` (add noise-rules panel), `UnmatchedInbox.tsx` and `CompanyInboxView.tsx` (call the new safe-claim function), small enhancement to `CompanyInboxView.tsx` for the "previously seen" hint.

No schema changes to `lead_emails` or `leads`. No backfill of historical `lead_email_metrics` beyond the orphan cleanup. The 1,274 internal-sender misroutes are left alone — they're rep emails on legitimately stapled threads.

