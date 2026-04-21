

# Deep verification: 12/15 pass cleanly · 2 real bugs found · here's the surgical fix

## Verification scorecard (just ran on 15 random leads)

| Lead | Emails | Direct-participant match | Status |
|---|---|---|---|
| CT-019 Timur Grinevic | 6 | 6/6 (100%) | ✓ Clean |
| CT-036 Brandon Anderson | 7 | 7/7 (100%) | ✓ Clean |
| CT-298 John Caplice | 1 | 1/1 (100%) | ✓ Clean |
| CT-405 Mazy Marjani | 7 | 7/7 (100%) | ✓ Clean |
| CT-411 Farooq Cheema | 8 | 8/8 (100%) | ✓ Clean |
| CT-413 Evan Farrell | 1 | 1/1 (100%) | ✓ Clean |
| CT-422 Paul Habrecht | 3 | 3/3 (100%) | ✓ Clean |
| SC-I-039 Josh Klieger | 3 | 3/3 (100%) | ✓ Clean |
| SC-T-025 Nat Liang | 1 | 1/1 (100%) | ✓ Clean |
| SC-T-026 Greg Caso | 23 | 23/23 (100%) | ✓ Clean |
| SC-T-051 Senthil V (icloud!) | 3 | 3/3 (100%) | ✓ Clean |
| TGT-018 Tyler Sun (gmail!) | 1 | 1/1 (100%) | ✓ Clean |
| SC-T-022 Lei Jin (zero) | 0 | – | ✓ Correct (no traffic in mailbox) |
| SC-T-052 Leroy Joenoes (zero) | 0 | – | ✓ Correct |
| CT-324 ike Bams (zero) | 0 | – | ✓ Correct |

System totals: **1,055 matched · 3,131 unmatched · 165 leads with emails.** Personal-domain leads (gmail/icloud/outlook primary) all show 100% match — the catastrophic bug is gone.

## But I found 2 bugs the broad scan would have missed

I ran a system-wide pollution scan (any claimed lead with <70% participant match). Two leads still leak — and the bad rows were **inserted today after the matcher fix deployed** (verified via `created_at` timestamps). So the current matcher still has two holes:

### Bug A — Google Workspace noise on CT-002 (Harshal Devnani, gmail.com primary)

11 emails from `workspace@google.com` and `calendar-notification@google.com` got stapled to Harshal. Trace:
- These are **inbound Google system mails to Malik** (calendar accepts, workspace ads). External participant list = `[workspace@google.com]`
- Matcher Tier 1: no lead has primary `workspace@google.com` → skip
- Tier 2/3: empty → skip
- Tier 4 domain: `google.com`. Is `google.com` in `PERSONAL_PROVIDERS`? **No** — only `gmail.com` is. The blocklist forgot the parent
- Query: `email.ilike.%@google.com OR company_url.ilike.%google.com%`. Exactly one lead matches → match wins → wrong staple

**Fix**: Add `google.com`, `googlemail.com`, `apple.com`, `microsoft.com`, `mail.com`, `zoho.com`, `qq.com`, `163.com` and a few more system/free providers to `PERSONAL_PROVIDERS`. Also: **never match a domain when the participant list contains only addresses that look like system noreply senders** (`workspace@`, `calendar-notification@`, `noreply@`, `no-reply@`, `mailer-daemon@`, `bounces@`).

### Bug B — Same-domain colleague pollution on CT-366 (James Scerbo, oilchangers.com)

3 emails from `support@captarget.com` to `jerit.daley@oilchangers.com` (with `noah.swanson@oilchangers.com` CC'd) got stapled to James Scerbo's deal. Trace:
- James's primary = `james.scerbo@oilchangers.com` — NOT in any participant list
- His secondary contact = `kyle.carlisle@oilchangers.com` — also NOT in participants
- No stakeholders
- Tier 4 domain: `oilchangers.com`. Exactly 1 lead claims it → match wins → wrong staple

This is technically a **correct** behavior of the current matcher (one company = one deal, route the colleague's email to the only deal we have for that company). **But it's wrong for outbound/internal threads where the actual prospect contact isn't on the email** — those are usually internal team chatter or ops emails to a different colleague that shouldn't auto-attach.

**Fix**: Tighten Tier 4 — only accept the domain match when **at least one participant in the thread is a known contact for that lead** (primary, secondary, or stakeholder). If the thread only mentions an unknown colleague at the same company, leave it unmatched for human triage. This is the same rule that protects against the gmail.com case.

Actually a cleaner rule: **Tier 4 should require the matching participant's local-part to be confirmed somewhere on the lead** (primary, secondary, or stakeholder). If we're matching by domain alone with no confirmed participant, it goes to Unmatched.

## Plan — 4 precise changes + cleanup sweep

### 1. Expand `PERSONAL_PROVIDERS` blocklist
In `sync-gmail-emails`, `sync-outlook-emails`, `backfill-hydrate`, `rematch-unmatched-emails`, `unclaim-bad-matches` — add: `google.com`, `googlemail.com`, `apple.com`, `microsoft.com`, `mail.com`, `zoho.com`, `qq.com`, `163.com`, `pm.me`, `tutanota.com`, `fastmail.com`, `gmx.com`. (System/parent/free domains that shouldn't ever serve as a routing key.)

### 2. Skip domain match when only system-noise senders are in `external`
Before Tier 4 fires, check if every external participant matches a system-noise pattern (`workspace@`, `calendar-notification@`, `noreply@`, `no-reply@`, `mailer-daemon@`, `bounces@`, `accounts@google.com`, `support@google.com`, etc.). If so, return `null` immediately — these emails belong in Unmatched, not on a deal.

### 3. Tighten Tier 4 with confirmed-participant requirement
After identifying a candidate lead by domain, verify that **at least one participant local-part also appears as a known contact for that lead** (primary email match OR secondary_contacts JSON OR `lead_stakeholders` row). If no confirmed participant overlaps, return `null`. This kills the CT-366-style pollution while preserving legit matches like Greg Caso (who's directly in the thread).

### 4. One-shot cleanup sweep on the 14 polluted rows
Extend `unclaim-bad-matches` with a new case D: any row where `from_address` matches a system-noise pattern OR where the lead's primary/secondary/stakeholder addresses don't appear anywhere in `from_address + to_addresses + cc_addresses`. Run server-side, expect ~14 rows to flip to `unmatched` (CT-002's 11 + CT-366's 3).

### 5. Re-verify
Re-run the 15-lead sample + system-wide <70% scan. Expected outcome: zero leads below 90% direct-participant ratio.

## Honest answer to "is this correct?"

**Yes, with the 2 bugs above fixed**: the matcher will route every prospect email correctly when the prospect (or a known colleague/stakeholder) appears in the participant list. Google Workspace notifications and unrelated colleague threads will correctly land in Unmatched.

**What's still inherently impossible**: a prospect emails Malik from a fresh personal address never registered anywhere on their lead record. Those will stay in Unmatched Inbox for human triage — the only safe behavior. We could add a "claim to lead" UI button there as a future enhancement.

## Files

- **MODIFY** `supabase/functions/sync-gmail-emails/index.ts` — expand blocklist, add system-noise pre-check, add Tier 4 confirmed-participant guard
- **MODIFY** `supabase/functions/sync-outlook-emails/index.ts` — same
- **MODIFY** `supabase/functions/backfill-hydrate/index.ts` — same
- **MODIFY** `supabase/functions/rematch-unmatched-emails/index.ts` — same
- **MODIFY** `supabase/functions/unclaim-bad-matches/index.ts` — add Case D (system-noise + no confirmed participant)
- After deploy: invoke `unclaim-bad-matches` server-side, then re-run the 15-lead verification + the <70% pollution scan, and report final scorecard

