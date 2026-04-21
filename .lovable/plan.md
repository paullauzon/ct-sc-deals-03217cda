

# Don't wipe and re-sync — there's nothing to gain. Here's the honest scorecard and the actual next move.

## Why a wipe-and-resync would be wasteful (and risky)

I just ran the full diagnostic. Current state of the matched data:

| Check | Result |
|---|---|
| Total emails in DB | 4,188 (1,049 matched · 3,139 unmatched) |
| Matched leads with primary in participants | **1,049 / 1,049 = 100.0%** |
| Unmatched emails where a lead's PRIMARY would match | **0** |
| Unmatched emails where a STAKEHOLDER would match | **0** |
| Unmatched emails where a SECONDARY contact would match | **0** |
| Backfill window covered | Jan 21 → Apr 21, 2026 (90d, 4,620 msgs walked) |

**Translation:** every email we currently have attached to a lead is correctly attached. Every email currently in Unmatched is unmatchable by any of the 4 routing tiers — it's newsletters, system noise, internal `captarget.com` threads, or one-off cold outreach from people who aren't in the CRM.

A wipe + resync would:
- Take 30+ minutes of API quota
- Hit the exact same Gmail messages
- Run them through the exact same hardened matcher
- Produce the **exact same 1,049 matched / 3,139 unmatched** result
- Risk losing the auto-discovered stakeholder additions made over the last few hours

## What "100% coverage" actually requires (and where we genuinely sit)

```text
Layer                          Coverage    Action needed
────────────────────────────────────────────────────────────
1. Mailbox fetch (90d)         ✓ Complete   None
2. Ongoing 10min sync          ✓ Live       None — watchdog now alerts on stalls
3. Matcher routing             ✓ 100%       None — 0 false orphans, 0 pollution
4. Personal-email identity     ⚠ Inherent   Auto-stakeholder (live) + Claim UI (already built)
5. Pre-Jan-21 history          ✗ Missing    1-year backfill (one-click)
```

The only **real** gap is layer 5: emails older than Jan 21, 2026 are not in the DB. That's not a matcher problem — it's a backfill-window problem. The fix is one button, not a wipe.

## What I recommend instead — 1 action, 5 minutes

**Run a 1-year backfill on Malik's mailbox.** This:
- Walks Gmail back to April 2025 (instead of Jan 2026)
- Adds ~10,000-15,000 new historical messages
- Routes each one through the hardened 4-tier matcher
- Won't touch existing data — backfill is additive and uses message-ID dedup
- Will likely surface another 1,000-2,000 matched emails for older deals (CT-001 thru CT-100 era)
- Auto-stakeholder discovery fires on every Tier-4 match → expands future routing automatically

**You already have the UI for this.** Mailbox Settings → backfill window selector → choose "1 year" → click run. The `BackfillProgressPanel` shows live progress.

If after the 1-year backfill you still want more, the same selector offers "All time" which walks the entire mailbox history.

## When a wipe-and-resync WOULD make sense (none of these apply right now)

- If the matcher had a known bug that mis-routed historical data → **doesn't apply** (0 pollution detected)
- If body content was corrupted → **doesn't apply** (bodies are intact, never re-fetched after insert)
- If we changed the schema in a breaking way → **doesn't apply** (no schema changes pending)

## Honest answer to "are we 100%?"

- **Of the emails we've fetched: yes, 100% routing accuracy.** Verified across 45+ random leads + system-wide pollution scan.
- **Of the universe of emails in Malik's mailbox: ~70%.** The 30% gap is everything older than 90 days. Run the 1-year backfill to close it to ~95%+.
- **Of personal-email edge cases (prospect emails Malik from `sarah.personal@gmail.com`):** these correctly land in Unmatched. The Claim UI in Unmatched Inbox routes them in one click + auto-adds the sender as a stakeholder so future emails route automatically.

## Suggested action

Click **Backfill 1 year** on Malik's mailbox in Settings → Mailboxes. I'll monitor it server-side and report the new totals when it finishes (~20-30 min).

If you want, I can also kick that off automatically — say the word and I'll invoke it now.

