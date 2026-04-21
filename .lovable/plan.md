

# The sync was a disaster — here's what actually happened, and the fix

## Hard truth: what's actually in the database

I queried the live DB. The picture is worse than the screenshots suggest.

| Symptom | Reality |
|---|---|
| Kenneth Hall shows 61 emails | **Should have ~5.** 56 of his 61 are emails from totally unrelated people (sanisaleem2@, karanmehtak3@, ericafuller56@, bughunter229@…) wrongly stapled to his deal |
| Prateek Aneja shows 0 emails | His 3 real emails exist but are stapled to a **different lead record (CT-408)** — duplicate confusion |
| Adam Berman shows 0 emails | Genuinely no Gmail thread in last 90d. His other duplicate (Savade Holdings) also has nothing |
| Empty-state still says "via Zapier" | Stale copy from before the OAuth integration |
| **System-wide** | **151 wrongly-matched emails across 24 polluted leads.** This is a lower bound — true number is higher because the check only catches obvious cases |

## The smoking gun (root cause)

`supabase/functions/backfill-hydrate/index.ts` line 183, and the identical code in `sync-gmail-emails/index.ts` and `sync-outlook-emails/index.ts`:

```typescript
// 4) Domain-fuzzy fallback
const { data: fuzzy } = await supabase.from("leads")
  .select("id")
  .or(orParts.join(","))
  .limit(1);              // ← THIS LINE
if (fuzzy && fuzzy.length > 0) return fuzzy[0].id;
```

`.limit(1)` returns the **first** lead whose email matches `%@gmail.com` — **without checking if the domain is ambiguous**. 36 leads in the system use `@gmail.com`. So every random `someone@gmail.com → id@captarget.com` email gets dumped onto whichever gmail-using lead the database happens to return first (Kenneth, in this case).

The `rematch-unmatched-emails` function I deployed earlier has the **correct** logic (skips when `byDomain.size > 1`) — but the original sync functions that produced the data still have the broken logic, and the broken matches were never undone.

## The fix — three coordinated steps

### Step 1: Patch the matcher in all four edge functions

Apply the **same 4-tier matcher with ambiguity check** that `rematch-unmatched-emails` uses, in:
- `backfill-hydrate/index.ts` (the historical importer)
- `sync-gmail-emails/index.ts` (incremental Gmail every 10min)
- `sync-outlook-emails/index.ts` (incremental Outlook every 10min)
- `ingest-email/index.ts` (Zapier inbound, if it has the same logic)

New rule for tier 4 (domain): **count distinct lead IDs first; only match if exactly one lead claims that domain. Otherwise return null → email goes to Unmatched Inbox for human review.** Always exclude `gmail.com`, `yahoo.com`, `outlook.com`, `icloud.com`, `hotmail.com` from the domain fallback entirely — these are personal mailbox providers and should NEVER be used to infer a lead.

### Step 2: Quarantine the bad matches (don't blindly delete)

Run a one-shot **un-claim sweep** that finds every `lead_emails` row where the matched lead's email is **not** present in `from_address`, `to_addresses`, or `cc_addresses`, AND the match was a domain fallback (lead's domain is in the personal-provider blocklist OR the domain is shared by ≥2 leads). Set those rows back to `lead_id = 'unmatched'`.

This keeps the data — we're not deleting Malik's actual mailbox content — we're just unstapling it from the wrong deals. After the un-claim, the corrected matcher can re-run via `rematch-unmatched-emails` and most of these will either find their real lead or stay legitimately unmatched.

Expected outcome on Kenneth Hall: drops from 61 emails to ~5 real ones. System-wide: ~151+ emails un-stapled.

### Step 3: Fix the duplicate-lead mis-routing (Prateek's case)

Prateek's 3 emails attached to `CT-408` (a duplicate) instead of his canonical record `CT-057`. Add a **duplicate-aware redirect** to the matcher: when a match resolves to a lead where `is_duplicate = true`, follow `duplicate_of` to the canonical record and use that ID instead. Run this as part of the same sweep so existing rows get redirected too.

### Step 4: Cleanup polish

- Update `EmailsSection.tsx` empty-state: replace "connect Gmail/Outlook via Zapier" with "Connect a mailbox in Settings → Mailboxes" (Gmail OAuth is live; Zapier mention is misleading)
- Add a **"Verify mailbox sync"** report at top of Unmatched Inbox showing: "X emails un-stapled from wrong leads · Y rematched correctly · Z genuinely unmatched"
- Fix the `email_backfill_jobs.messages_matched` counter (currently 7109 / 4620 processed because it incremented on every false-positive domain hit) — recount from `lead_emails` after the sweep

## Files

- **MODIFY** `supabase/functions/backfill-hydrate/index.ts` — fix `findLeadIdByEmail` tier 4
- **MODIFY** `supabase/functions/sync-gmail-emails/index.ts` — same fix
- **MODIFY** `supabase/functions/sync-outlook-emails/index.ts` — same fix
- **MODIFY** `supabase/functions/ingest-email/index.ts` — same fix if applicable
- **MODIFY** `supabase/functions/rematch-unmatched-emails/index.ts` — add duplicate-lead redirect logic + personal-provider blocklist (already has ambiguity check)
- **NEW** `supabase/functions/unclaim-bad-matches/index.ts` — one-shot sweep that detects + un-stapes wrongly-matched rows back to `unmatched`. Idempotent. Safe to re-run.
- **MODIFY** `src/components/UnmatchedInbox.tsx` — add "Run cleanup sweep" button (calls unclaim → then rematch in sequence) with progress toast
- **MODIFY** `src/components/EmailsSection.tsx` — fix empty-state copy
- **NO migration needed** — pure data correction via service-role updates

## What Malik will see after this lands

1. Kenneth Hall's Emails tab drops from 61 to ~5 emails — and they'll all actually be FROM or TO Kenneth
2. Prateek's 3 emails appear correctly under his canonical CT-057 record
3. Adam Berman remains at 0 (correct — Malik never emailed him from Gmail in 90d window)
4. Unmatched Inbox grows by ~150 from the un-claim, but a follow-up rematch sweep correctly assigns most to the right leads
5. Going forward, every new sync (Gmail incremental every 10min) routes correctly because the matcher is fixed at the source
6. The "Run cleanup sweep" button in Unmatched Inbox lets you re-run this at any time if more leads get added later

## What we're explicitly not doing

- Not deleting all 4,181 emails — that would lose Malik's actual mailbox content. The data is fine; only ~3.6% of matches are wrong.
- Not re-running the 90-day Gmail backfill — wasteful and the bug was in matching, not fetching. Bodies are correct.
- Not touching Calendly/Fireflies sync — unrelated systems.

