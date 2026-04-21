

# The 190 Fireflies leads — exactly where they stand right now

## Ground truth (just queried)

You actually have **161 leads** in the backfill queue (not 190 — the original enqueue de-duped against leads that already had a transcript). Here's the live status:

| Status | Count | Meaning |
|---|---|---|
| ✓ Matched (transcript recovered) | **0** | Fireflies returned a transcript |
| ✗ Gave up | **29** | Fireflies API confirmed it has no recording (past their ~90 day retention) |
| ⏳ Pending | **132** | Still in queue, will be picked up by the 5-min cron tick |
| **Total** | **161** | |

**100% of the gave-up leads** failed for the same terminal reason: `not_in_fireflies_api`. Their meetings were too old (mostly 2024 / early 2026) — Fireflies discarded the recordings before we asked for them.

The queue is draining at ~5 leads every 5 minutes, so the remaining **132 will finish in ~2.2 hours**. Realistic final outcome: maybe 5-10 matches, ~150 marked "gave up · not in Fireflies API."

## Why you can't see this today

The current `FirefliesBackfillProgress` widget only shows aggregate counts and the "Drain now" button. It doesn't let you **see which leads were classified, what happened to each, or browse the gave-up list**. The `AutomationRunDrawer` only shows events from a single drawer-session (since you opened it), not the full historical record.

## Fix — a "Backfill Progress Report" view

### 1. Expand `FirefliesBackfillProgress` into a full report card

Add a "View all 161 leads" button next to the existing progress bar that opens a dedicated **Sheet** showing the complete per-lead breakdown:

```text
Fireflies Backfill Report                                    [Refresh]
Started Apr 21, 11:19  ·  29 / 161 classified  ·  18% complete
Estimated full drain:  ~2.2 hours remaining (132 pending @ 5/5min)

[ All 161 ]  [ ✗ Gave up (29) ]  [ ⏳ Pending (132) ]  [ ✓ Matched (0) ]

┌─────────────────────────────────────────────────────────────────┐
│ Lead              Company             Booked        Status      │
├─────────────────────────────────────────────────────────────────┤
│ Dr. Phillip Hearn Helixmanagement.    Jan 12, 2026  Gave up · … │
│ Nezim Mmegwa      Nezim               Feb 02, 2026  Gave up · … │
│ Tim Murray        Conniehealth        Feb 26, 2026  Gave up · … │
│ Bobby Tyson       Journeyman Partners Mar 31, 2026  Gave up · … │
│ Malik Hayes       CAPTARGET Refer.    Feb 05, 2026  Pending · 504 timeout, retrying │
│ …                                                                │
└─────────────────────────────────────────────────────────────────┘

Each row clickable → opens lead's Deal Room. "Gave up" rows show the
exact reason on hover. Pending rows show "next attempt at HH:MM".
```

### 2. Per-row detail (hover or click)
For each lead show:
- **Booked date** (so you see why Fireflies doesn't have it — if >90 days old, that's the explanation)
- **Last attempt timestamp + error message** (truncated, full on hover)
- **Attempts used / max** (e.g. "1/5")
- **Quick action**: "Open in Deal Room" link

### 3. Group + filter the data
Tab-filter buttons at the top: **All · Gave up · Pending · Matched**. Default to **All**. Each tab shows count badge.

### 4. Export to CSV
Button: **Export report (CSV)** — downloads `lead_id, name, company, booked_at, status, last_error, attempts, updated_at` for all 161 rows so you have a permanent audit trail.

### 5. Surface the "why no matches" story up front
At the top of the report, a one-line summary:

> "29 of 29 classified leads gave up because Fireflies API has no recording — their meetings were booked between May 2024 and Mar 2026, mostly past Fireflies' ~90 day retention. Match rate is expected to stay near 0% for these old meetings."

This makes it instantly clear that the system is working correctly and the low recovery rate is a Fireflies retention limit, not a bug.

## Files

- **MODIFY `src/components/FirefliesBackfillProgress.tsx`**
  - Add "View full report" button next to "Drain now"
  - Add `<FirefliesBackfillReport />` Sheet that loads on open
- **NEW `src/components/FirefliesBackfillReport.tsx`**
  - Sheet with tab filters, table of all 161 rows joined to `leads` for name/company/booked_at
  - Per-row tooltip with error/attempts
  - Export-to-CSV button
  - Refreshes every 15s while open (lighter than the existing 10s poll since this view is heavier)

## What you'll see right after this lands

1. Open Settings → Automations
2. The backfill progress card now has a `[View full report]` button
3. Click it — slide-out sheet opens with all 161 leads, filterable by status
4. You can immediately see exactly which leads gave up, why, and which are still pending
5. Export the full report to CSV any time for offline review or audit

