

# Email tab — mockup vs. implementation audit

I checked the live `EmailsSection.tsx` (the component rendered under the "Emails" sub-tab in the Deal Room) against your mockup. Here's the gap analysis.

## What's already implemented ✅

| Mockup requirement | Status | Where |
|---|---|---|
| Email sub-tab exists per lead | ✅ | `LeadDetailPanel.tsx` line 375 — `Emails (count)` tab |
| One row per conversation thread | ✅ | `groupByThread()` collapses by `thread_id` |
| Thread shows: subject, latest activity date, total opens, total clicks | ✅ | `ThreadCard` + header aggregate stats |
| "Replied" indicator | ✅ | `replied_at` badge with `Reply` icon |
| Inbound/outbound direction icons | ✅ | `ArrowUpRight` / `ArrowDownLeft` colored chips |
| Latest reply preview snippet under thread | ✅ | "Last reply · {date} · {snippet}" line |
| Open count + click count per thread | ✅ | Aggregated badges with `Eye` / `MousePointerClick` icons |
| Compose new email button | ✅ | Header `Compose` button |
| Reply directly from a message | ✅ | `Reply` button per inbound row, prefills `EmailComposeDrawer` |
| AI-drafted badge | ✅ | Shown in `UnifiedTimeline` (Activities tab) but **NOT in the Email sub-tab** — see Gap #2 |
| `email_type` filter (1-to-1 vs marketing) | ✅ | "1-to-1 only" / "Show all" toggle, defaults to one_to_one+sequence |
| Marketing emails hidden by default | ✅ | Query filters `email_type IN ('one_to_one','sequence')` unless toggled |
| Scheduled emails strip | ✅ | `ScheduledStrip` component shows pending sends with cancel |
| Realtime updates (new emails appear live) | ✅ | Postgres realtime subscription on inserts/updates |
| Database has `email_type`, `sequence_step`, `ai_drafted` columns | ✅ | Verified in DB schema |

## Gaps vs. the mockup ❌

### Gap 1 — No "Thread email replies" toggle (collapsed vs. individual rows)
The mockup has a toggle that flips between *one row per thread* (default) and *one row per email*. Currently threads are always collapsed and can only be expanded individually. The "Expand all / Collapse all" button is close but not the same — it expands the bodies, not the row structure. **Add a global thread-grouping toggle**.

### Gap 2 — AI-drafted badge missing from the Email sub-tab
`UnifiedTimeline` (Activities tab) shows an "AI" badge when `ai_drafted=true`, but `EmailsSection` does NOT. The mockup explicitly shows `[AI-drafted]` and `[AI-personalized]` chips on rows. **Add `ai_drafted` badge rendering to `EmailRow` and `ThreadCard`**.

### Gap 3 — Sequence step labels not surfaced in the Email sub-tab
`UnifiedTimeline` renders `sequence_step` as a mono-font pill (e.g. "S1-A", "S5-B") but `EmailsSection` ignores `sequence_step` entirely. The mockup leans heavily on these labels for orientation. **Render `sequence_step` as a pill on each row** (and as the lead pill on collapsed thread headers when present).

### Gap 4 — Thread-no-reply / Auto-triggered status pills missing
The mockup has explicit thread-state pills:
- "Thread — no reply yet" (outbound thread with no inbound reply)
- "James replied" / "replied" (thread has inbound replies)
- "Auto-triggered" (system-sent confirmations like Calendly bookings)
- "AI from Fireflies" (recap drafts generated post-meeting)

Currently only an aggregate "Replied" badge exists per email. **Compute thread state and render a status pill on the thread header**.

### Gap 5 — Header counts wording mismatch
Mockup header: `ALL EMAIL THREADS — JAMES MITCHELL (6 THREADS, 14 EMAILS TOTAL)`. Current header: `Emails with James (14)`. **Update header to show both thread count and email count**.

### Gap 6 — No "what does NOT appear here" affordance
Mockup has explanatory cards explaining the inbox-style filtering rules. Optional but useful first-time-use. **Add a one-time dismissable info banner** explaining the 1-to-1 filter and the `m.hayes@captarget.com` mailbox scoping.

### Gap 7 — Mailbox scoping not enforced
Mockup says "Sequence emails are shown here only if sent from m.hayes@captarget.com". Currently we show all `lead_emails` regardless of which connected mailbox sent them. With Outlook coming online (per-user mailboxes), this matters: an email sent from a different rep's mailbox to the same lead should still surface, but the *currently-viewing rep's* sent items should be visually distinguished. **Add a "from mailbox" badge or filter pill** when more than one connected mailbox has emailed this lead.

## Recommended build (in priority order)

1. **Sequence step pills** on each row (Gap 3) — high signal, 5 lines of code, parity with Activities
2. **AI-drafted badge** on each row (Gap 2) — same pattern, 5 lines
3. **Thread status pills** (Gap 4) — "Thread — no reply yet" / "{Lead} replied" / "Auto-triggered"
4. **Header rewrite** to "ALL EMAIL THREADS — {NAME} ({n} threads, {m} emails total)" (Gap 5)
5. **"Thread email replies" toggle** — collapse-all vs. flatten to individual rows (Gap 1)
6. **Mailbox scoping badge** (Gap 7) — only render when >1 mailbox has touched the lead
7. **One-time info banner** (Gap 6) — lowest priority

## Files to touch

| File | Change |
|---|---|
| `src/components/EmailsSection.tsx` | All 7 gaps land here — header, ThreadCard pills, EmailRow badges, new toggle |
| (no DB changes needed) | `email_type`, `sequence_step`, `ai_drafted` columns already exist and populated |

## What the user gets

The Email sub-tab will visually match the mockup: scannable thread list with sequence step labels, AI-drafted markers, thread reply state, an accurate "(N threads, M emails)" header, and an optional flatten-to-individual-rows view for power users. No backend work — everything is rendered from columns that already exist on `lead_emails`.

