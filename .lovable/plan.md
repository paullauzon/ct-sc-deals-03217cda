

# Auth polish, user profiles, and actor tracking

## What you're getting

1. **Verified end-to-end auth** — Google OAuth already works (Adam is logged in right now via Google token as of 15:11 UTC today). Email/password + signup also wired. I'll do one full pass to confirm redirects, error states, and the "first user = admin" rule hold.
2. **Refreshed sign-in screen** — Captarget logo at top, real Google "G" logo on the OAuth button, SourceCo wordmark subtle beneath, two-panel layout (brand side + form side on desktop, stacked on mobile), polished monochrome per the design system.
3. **Profile page** — new `/profile` route where any user can view/edit their name, see email (read-only), pick default brand (Captarget / SourceCo), see their role badge (admin/rep), and see when they joined.
4. **Team page (admin-only)** — `/settings/team` lists all users (from `profiles` + `user_roles`), shows each role, lets admins promote/demote between `rep` and `admin`. Non-admins see the page but can't mutate.
5. **User menu in top nav** — avatar circle (initials) in the top-right next to Settings gear. Clicking opens a dropdown: name + email header, "Profile", "Team" (admins only), "Sign out".
6. **Actor tracking on every change** — every `lead_activity_log` entry is now tagged with `actor_user_id` + `actor_name` (denormalized), so the activity timeline shows "Stage changed by Adam · 3m ago" instead of anonymous events. Same for notes, tasks, stage changes, field edits.

## Technical approach

**DB changes (one migration):**
- `ALTER TABLE lead_activity_log ADD COLUMN actor_user_id uuid, ADD COLUMN actor_name text DEFAULT '';`
- Add index on `actor_user_id` for filtering.
- Tighten `user_roles` RLS: keep current admin-manage policy; no change needed.
- Tighten `profiles` UPDATE: already limited to `auth.uid() = id` — fine.

**Frontend:**
- `AuthContext` extended with `profile` (name, email, default_brand) and `isAdmin` boolean. Loaded once on session change, exposed to whole app.
- `src/lib/activityLog.ts` — `logActivity()` reads current user from `supabase.auth.getUser()` once per call and stamps `actor_user_id` + `actor_name`. Every existing call site keeps working without signature change.
- `src/pages/Auth.tsx` — redesigned layout. Loads `/captarget-logo.png` (already in `public/`). Google button uses inline SVG for the multicolor "G" mark. Left brand panel hidden on mobile. Password visibility toggle. Clearer error messages for "invalid credentials" vs "email already exists".
- `src/pages/Profile.tsx` (new) — form with name, default brand select, role badge, "joined" date, sign-out button.
- `src/pages/Team.tsx` (new) — table of users; admin-only actions (promote/demote). Uses existing `has_role()` RPC via RLS; UI gates mutation buttons on `isAdmin`.
- `src/components/UserMenu.tsx` (new) — avatar dropdown, mounted in `Index.tsx` top nav next to the Settings gear.
- `src/App.tsx` — add `/profile` and `/settings/team` routes, both guarded by `SessionGuard`.
- `src/components/lead-panel/LeadActivityTab.tsx` — render `actor_name` inline on each activity row.

**Actor capture rule:** read user once at call-site, don't pass through every function. `logActivity()` grabs it from the Supabase client. Activity timeline now shows who did what.

**What won't change:** RLS policies on business tables, edge functions, existing data. All 437 existing `lead_activity_log` rows keep `actor_user_id = null` and render as "System" — no backfill needed.

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/<ts>_add_activity_actor.sql` (new) | Add `actor_user_id`, `actor_name` to `lead_activity_log` + index |
| `src/contexts/AuthContext.tsx` | Add `profile`, `isAdmin`; fetch on session change |
| `src/lib/activityLog.ts` | Stamp actor on every log insert |
| `src/pages/Auth.tsx` | Full redesign with Captarget branding + Google "G" logo |
| `src/pages/Profile.tsx` (new) | User profile view/edit |
| `src/pages/Team.tsx` (new) | Admin user management |
| `src/components/UserMenu.tsx` (new) | Avatar dropdown in top nav |
| `src/App.tsx` | Register `/profile` and `/settings/team` |
| `src/pages/Index.tsx` | Mount `<UserMenu />` in nav |
| `src/components/lead-panel/LeadActivityTab.tsx` | Render actor name on each event |
| `src/integrations/supabase/types.ts` | auto-regenerated |

## End state

Every change in the CRM is attributable to a named user. Admin can manage the team without touching SQL. The sign-in page looks like a real product. Each user has a home in the app (Profile) and knows their role at a glance. Google OAuth, email signup, and "first user becomes admin" remain verified working.

