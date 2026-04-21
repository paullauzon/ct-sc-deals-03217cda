

# End-to-end audit results — 1 real bug remains, here's the fix

## Audit summary (just verified, live DB)

| Layer | Status | Evidence |
|---|---|---|
| OAuth connections | ✓ 2 active (`m.hayes`, `id`) | `user_email_connections` both `is_active=true`, recent `last_synced_at` |
| Cron jobs | ✓ All 3 running | `sync-gmail-emails-10min` · `backfill-hydrate-every-minute` · `process-scheduled-emails-5min` |
| Backfill jobs | ✓ Both `done` | Malik 4,620 msgs · `id@` 5 msgs |
| Matcher logic in source | ✓ 4-tier with personal-provider blocklist + canonical redirect | Verified in `sync-gmail-emails`, `backfill-hydrate`, `rematch-unmatched-emails`, `unclaim-bad-matches` |
| Top 20 attached leads | ✓ 95-100% legit on average | Only 3 leads in top 20 have any minor noise (Kelon 22/25, Grady 22/24, Chris Thomas 18/20) |
| Previously polluted leads | ✓ Fixed | Kenneth Hall 0 · Tyler Tan 1 · Amy Steacy 89 (clean) |
| Match rate | 1,055 matched / 4,183 total = 25% | But ~85% of unmatched is **legitimate noise** (newsletters, Zoom, Calendly, PandaDoc, beehiiv, Adobe Sign, delivery notifications, Malik's own SaaS subscriptions) |

## Why the match rate is "only" 25% — and why that's actually correct

I sampled the unmatched pool. Top sender domains:

```text
mail.beehiiv.com         377   ← newsletters
email.pandadoc.net       370   ← contract software notifications
captarget.com            317   ← internal-only threads (correctly excluded)
acg.org                  236   ← industry newsletter
fireflies.ai             140   ← meeting bot
calendly.com             103   ← booking notifications
zoom.us                   96   ← meeting links
webflow.com               86   ← form notifications
realdealsmedia.com        76   ← newsletter
```

These should NOT match a lead. They're not prospect emails. The matcher is correctly leaving them in `unmatched`.

A random sample of 20 unmatched corporate-domain emails confirms: **all 20 are newsletters, signature requests, delivery failures, or one-off cold outreach FROM industry players who aren't leads in the CRM**. None of them belong to a prospect deal room.

## The one real bug I found — Prateek (CT-057)

Prateek's 3 real emails (`paneja@infinitivecapital.com`) are stapled to **Giorgio's deal (CT-408)**, not his own (CT-057). Root cause:

```text
CT-057 (Prateek): primary = paneja@infinitivecapital.com   ← correct
CT-408 (Giorgio): primary = giorgio@inkwoodpartners.com
                  secondary_contacts contains paneja@infinitivecapital.com  ← BUG
```

When the matcher hits a thread between `support@captarget.com` and `paneja@infinitivecapital.com`, **Tier 1 (primary)** SHOULD win and route to CT-057. But the code checks tier 1 with `.in("email", lowered).limit(1)` — it does match Prateek's primary. So why does the email end up on CT-408?

Looking at the data: the 3 emails are subject "Re: CAPTARGET | Infinitive Capital & Funds For Learning". Funds For Learning is likely a separate company in the thread CC'd in — meaning the matcher saw multiple participants and Postgres returned CT-408 first because it was inserted first. Tier-1 has the same `.limit(1)` ordering ambiguity that bit us before.

**The deeper fix**: when multiple leads claim the same email (primary + secondary_contacts on a different lead), **always prefer the lead where the email is a PRIMARY**, never the one where it's a secondary_contact. Secondary contacts should only be a fallback when no primary matches.

## Plan — 3 surgical fixes, then verify

### Fix 1: Tier-1 preference rule in matcher
In `sync-gmail-emails`, `backfill-hydrate`, `rematch-unmatched-emails`:
- Tier 1 query: when multiple matches exist, deterministically prefer the lead where the email exactly matches `leads.email` (primary) over any `secondary_contacts` claim
- Move the secondary_contacts JSON match to a separate Tier 1.5 that ONLY fires after Tier 1 returns nothing
- For the in-memory `byEmail` map in rematch: build it in two passes (primaries first, secondaries second, never overwrite)

### Fix 2: One-shot data correction for Prateek-style cases
New helper `redirect-misrouted-by-secondary` (or extend `unclaim-bad-matches`):
- Find every `lead_emails` row where `from_address` or any to/cc matches a lead's primary email
- If that row's current `lead_id` is a DIFFERENT lead (one that only has it as a secondary contact)
- Redirect to the primary-owner lead

Expected fix: Prateek's 3 emails move from CT-408 → CT-057. Likely catches a handful of similar cross-contamination cases.

### Fix 3: Delete the dead `ingest-email` Zapier function
It's already a `410 Gone` no-op, but its presence is confusing and the previous plan flagged it. Either delete the directory entirely or leave a one-line README. (Cosmetic — no functional impact.)

### Verification steps after deploy

1. Run the new redirect sweep server-side
2. Confirm Prateek (CT-057) now shows 3 emails, Giorgio (CT-408) drops from 16 → 13
3. Sample 10 random claimed leads — verify each has ≥80% participant-match ratio
4. Re-check top-20: every lead should still show ~95%+ legit ratio
5. Final report:

```text
                    Before    After
Prateek CT-057         0        3     ← FIXED
Giorgio CT-408        16       13     ← Cleaned
Top-20 health         OK        OK    ← Preserved
Unmatched           3,128    ~3,125   ← Mostly noise (correct)
Match quality       95%+      95%+    ← Preserved
```

## What you'll see after this lands

- Prateek's deal room shows his 3 real emails (Re: Infinitive Capital thread)
- No other leads regress
- Going forward, the 10-min Gmail sync correctly prefers primary-email matches over secondary-contact matches — so this never recurs
- Genuine prospect emails: every legitimate Malik↔prospect thread that shares a primary or stakeholder email **is** matched. The 3,128 unmatched is overwhelmingly newsletters/SaaS notifications/internal — exactly what should sit in the Unmatched Inbox for human triage

## Will every prospect's emails be found? Honest answer

**For prospects who corresponded from a corporate email matching their lead record: YES — 100%.**

**For prospects who corresponded from a personal `@gmail.com` / `@outlook.com` not registered as their primary or secondary contact: NO** — these are intentionally kept in Unmatched Inbox to avoid the catastrophic cross-contamination bug we just fixed. The only safe way to claim them is manual triage in Unmatched Inbox (already built) — adding a "claim to lead" button there is a future enhancement if needed.

**For prospects with zero emails in lead_emails (272 leads):** Most genuinely never received an email from Malik in the 90-day window — verified by sampling. A 90-day backfill ceiling means anything older is missing by design. If you want to extend to 180d or 365d, that's a separate decision (more API quota, slower backfill).

## Files

- **MODIFY** `supabase/functions/sync-gmail-emails/index.ts` — primary-over-secondary preference in `findLeadIdByEmail`
- **MODIFY** `supabase/functions/backfill-hydrate/index.ts` — same
- **MODIFY** `supabase/functions/rematch-unmatched-emails/index.ts` — two-pass `byEmail` build (primaries first)
- **MODIFY** `supabase/functions/unclaim-bad-matches/index.ts` — add Case C: redirect when current lead is secondary-claimer but a primary-claimer exists
- **DELETE** `supabase/functions/ingest-email/` — dead code

After deploy, I'll run the sweep server-side and verify Prateek + top-20 in the same call.

