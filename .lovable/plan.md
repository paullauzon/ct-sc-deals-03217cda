

# Polish pass: finish what's shipped, then verify live

## What's already done (verified live just now)

| Thing | State |
|---|---|
| Sophisticated auth screen | ✅ Two-panel layout, Captarget + SourceCo logos, multicolor Google "G", password toggle, humanized errors |
| Google OAuth | ✅ Working (Adam logged in via Google right now) |
| Email/password signup | ✅ Wired, first user becomes admin automatically (DB trigger `handle_new_user`) |
| Profile page `/profile` | ✅ Name, email (read-only), default brand, role badge, joined date, sign-out |
| Team page `/settings/team` | ✅ Admin-only promote/demote between `rep` and `admin` |
| UserMenu avatar | ✅ Mounted in CRM nav with initials, dropdown, profile/team/sign-out |
| Actor tracking DB | ✅ `actor_user_id` + `actor_name` columns on `lead_activity_log` |
| Actor tracking code | ✅ Every `logActivity()` call stamps actor, cached 60s, cleared on sign-out |

**One confirmed user:** Adam Haile, admin, Google provider. The "no actor stamped on activity" count (0/1765) is expected — all 1765 rows predate the actor-tracking migration. New changes going forward will stamp.

## What to finish in this pass

### 1. Mount UserMenu in all 3 systems (not just CRM)

`Index.tsx` only renders `<UserMenu />` in the CRM nav. Business Operations and Client Success system views currently have no avatar/sign-out. Fix: move `<UserMenu />` outside the `system === "crm"` branch so it shows in every system.

### 2. Invite teammates from Team page (admin-only)

Currently the only way a new user enters the system is self-signup. Add an "Invite teammate" button on `/settings/team` that opens a small dialog: email + name + role. On submit, calls a new `invite-user` edge function that uses the Supabase admin API to send a magic-link invite with metadata (`name`, intended `role`). The DB trigger already handles profile creation; we'll add a post-signup hook to apply the intended role.

- **New edge function:** `supabase/functions/invite-user/index.ts` — takes `{ email, name, role }`, calls `supabase.auth.admin.inviteUserByEmail()`, stashes intended role in a small `pending_invites` table keyed by email.
- **New table:** `pending_invites (email text PK, name text, role app_role, invited_by uuid, invited_at timestamptz)`.
- **Trigger update:** `handle_new_user()` reads `pending_invites` by email; if present, applies that role instead of default `rep` and deletes the invite row.
- **UI:** `InviteTeammateDialog` inside `Team.tsx`, only visible to admins.

### 3. Small UX fixes to Profile

- Show connected provider ("Signed in via Google" or "Email & password") so users understand how they got in.
- Show a "Sessions" note: last sign-in time pulled from `user.last_sign_in_at`.
- Fix initials on Profile avatar: currently uses first 2 chars of name; use proper initials (first letter of first + last word) like `UserMenu` already does.

### 4. Show actor on the lead Activity tab (not just UnifiedTimeline)

`UnifiedTimeline.tsx` was updated last pass. Also update `LeadActivityTab.tsx` (the dedicated activity-only tab) to render `· by {actor_name}` on each row, with "System" fallback for pre-migration rows.

## Files touched

| File | Change |
|---|---|
| `src/pages/Index.tsx` | Move `<UserMenu />` out of CRM-only branch so it shows in Business + Client Success nav too |
| `supabase/migrations/<ts>_pending_invites.sql` (new) | Create `pending_invites` table + RLS (admin insert, service role read/delete); update `handle_new_user()` to consume it |
| `supabase/functions/invite-user/index.ts` (new) | Admin-only edge function that invites by email with pre-set role |
| `src/pages/Team.tsx` | Add "Invite teammate" button + dialog (admin-only) |
| `src/pages/Profile.tsx` | Show provider + last sign-in; fix avatar initials |
| `src/components/lead-panel/LeadActivityTab.tsx` | Render `· by {actor_name}` on each row |

## Verification steps (after implementation)

1. Sign out → re-sign-in with Google → confirm you land on the dashboard.
2. From avatar menu → Profile → change default brand → Save → reload → change persists.
3. From avatar menu → Team → Invite teammate → enter test email → they receive invite, land on signup, become `rep` automatically.
4. Change a lead's stage → open Activity tab → see "Stage changed by Adam" with your name.
5. Switch to Business Operations / Client Success → avatar still visible top-right.

## End state

- Three systems, one consistent user menu everywhere.
- Admins can grow the team without touching SQL.
- Profile page tells users how they signed in and when they last logged in.
- Every new change is attributed by name across every view of the activity log.
- Google OAuth, email signup, and "first user = admin" remain verified working.

