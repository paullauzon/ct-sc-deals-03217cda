

# Backfill Calendly: Remove "Already Stamped" Skip Check

## Problem
The first backfill run stamped `calendly_booked_at` on leads it matched. But the function also **skips leads that already have `calendly_booked_at` set** (line 108). This means if a lead was stamped but other fields (like `meeting_date`) weren't fully populated, or if new Calendly events exist for already-stamped leads, they get skipped. We need a "force" mode to re-process all matches.

## Solution
Add a `?force=true` query parameter to the backfill function. When set, it skips the `already_stamped` check and updates `meeting_date`, `calendly_booked_at`, and `assigned_to` for all matched leads regardless of existing data — without regressing stages past "Meeting Set".

### Changes to `supabase/functions/backfill-calendly/index.ts`
- Read `force` query param (default `false`)
- When `force=true`, skip the `already_stamped` early-return on line 108
- For already-stamped leads in force mode: update `meeting_date`, `calendly_booked_at`, and `assigned_to` without changing stage (same logic as the existing "stamped_only" branch on line 147)
- This ensures no stage regression while filling in any missing meeting dates

After deployment, we invoke once with `?force=true` to catch all leads the first backfill skipped or only partially updated.

## Files Changed
| File | Change |
|------|--------|
| `supabase/functions/backfill-calendly/index.ts` | Add `force` query param to bypass `already_stamped` skip |

