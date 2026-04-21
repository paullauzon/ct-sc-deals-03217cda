

# Calendly meeting coverage audit + full historical backfill

## Audit results (live DB)

**347 leads** in the dashboard sit at "Meeting Set" or beyond (so they all should have at least one Calendly meeting). Today only **92 (27%)** have `calendly_booked_at` stamped. That's the gap.

Breaking down the 347:

| Bucket | Count | What it means |
|---|---|---|
| Has `calendly_booked_at` ✅ | 92 | Calendly-linked, fully synced |
| Has `meeting_date` only (no Calendly link) | 149 | Imported from CSV — meeting happened but never tied to Calendly event |
| Totally missing meeting data | 106 | Lead at Meeting Set+ stage with NO meeting_date AND no calendly_booked_at — historical Closed Lost rows from the bulk seed |

By stage, the Closed Lost bucket is the biggest gap (253 Captarget + 30 SourceCo Closed Lost; only 42+16 Calendly-linked). These are real historical meetings worth ~3–4 years of Malik's calendar.

## The real constraint — current `backfill-calendly` only fetches 90 days

```ts
// backfill-calendly/index.ts line 92
const minStart = new Date(Date.now() - 90 * 86400000).toISOString();
```

Earliest meeting in the DB is **2022-02-07** — almost 4 years before the 90-day Calendly window. The Calendly API itself accepts arbitrary `min_start_time` values, so the limit is purely our code.

Pagination cap is also 10 pages (1,000 events). Malik likely has 2,000–5,000 historical events across 4 years.

## What I'll build

A **one-time full-history Calendly backfill** that:

1. **Removes the 90-day cap** — accepts a `?since=YYYY-MM-DD` query param defaulting to `2019-01-01` (well before earliest known meeting)
2. **Removes the 10-page cap** — paginates until `next_page` is null, no limit
3. **Includes cancelled events too** — currently filters `status=active`, but Calendly meetings that were rebooked or cancelled still represent a real touch point and the original lead should be stamped (with `meeting_outcome='cancelled'`)
4. **Smarter linking on backfill** — current code only stamps when `lead.email` matches `invitee.email` exactly. Extend to also check `secondary_contacts` JSONB and `lead_stakeholders` so a CFO/attorney calendar invite stitches onto the right lead (mirrors the email matcher we just shipped)
5. **Doesn't downgrade existing data** — never overwrites a `meeting_date` that's newer than the Calendly event (handles the "lead booked twice" case correctly)
6. **Resilient pagination** — self-reschedules via fire-and-forget POST to itself if it hits 100s wall-time, using a checkpoint cursor stored in a small `calendly_backfill_jobs` row (mirror of email backfill pattern)
7. **Writes summary** — counts of: events scanned, leads stamped, leads advanced from pre-meeting stages, leads not matched, returns the unmatched list so we can manually review

## Output for Malik (the reason to do this turn)

After the backfill completes you get a result JSON like:

```json
{
  "success": true,
  "eventsScanned": 3847,
  "leadsAdvanced": 12,
  "leadsStamped": 184,
  "alreadyStamped": 92,
  "unmatchedInvitees": 1247,
  "byBrandStamped": { "Captarget": 142, "SourceCo": 42 }
}
```

You'll see exactly which leads now have Calendly meetings tied to them, and the 1,200+ "unmatched" Calendly invitees that aren't in the CRM (those are people who booked but never submitted a form — separate cleanup).

## What this enables next turn

Once every lead at Meeting Set+ has its real Calendly event timestamps, **the Fireflies enrichment pass** you mentioned can match accurately on `(meeting_date ± 24h, attendee email)` instead of guessing. The current `sync-fireflies-post-meeting` already uses this pattern but only fires for the 92 leads with `calendly_booked_at`. After this build it'll fire for ~280 leads and pull all their historical transcripts.

## Files touched

- `supabase/functions/backfill-calendly/index.ts` — remove 90d cap, remove 10-page cap, add `?since=` and `?include_cancelled=true` params, extend matcher to `secondary_contacts` + `lead_stakeholders`, never-downgrade logic, self-reschedule on wall-time

## What I'm NOT doing this turn (per your instruction)

- **Fireflies enrichment** — separate request after this audit
- **Promoting unmatched Calendly invitees to leads** — flagged in output but not auto-created (these are mostly old ghost prospects)
- **UI changes** — backfill is a one-shot edge function call, no panel needed
- **Re-running for every connected calendar in Calendly org** — keep `CALENDLY_DEFAULT_OWNER = "Malik"` since 100% of Calendly traffic is his calendar per project memory

## Decisions baked in

1. **Backfill since date**: `2019-01-01` — covers all known leads (earliest meeting is 2022)
2. **Cancelled events**: included, stamped with `meeting_outcome='cancelled'` so they're visible but don't pollute "Meeting Held" counts
3. **Stage advancement**: only advance pre-meeting stages (`New Lead`/`Contacted`/`Qualifying`) → `Meeting Set`. Never re-advance a lead already at a later stage
4. **Owner**: hardcoded `Malik` (matches existing logic and project memory)

## After this build

- Run `backfill-calendly?since=2019-01-01&include_cancelled=true` once
- All ~280 leads at Meeting Set+ get their true Calendly meeting timestamps
- Result JSON shows exactly what was stamped and what wasn't
- Next turn: targeted Fireflies enrichment using those timestamps

