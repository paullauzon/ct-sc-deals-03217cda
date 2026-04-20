

# What's left in the email/communication system

Backend infrastructure for Gaps A, B, C, F, H, I, K is fully deployed. The remaining work is **almost entirely user-facing** — surfacing what the backend already produces and unlocking workflows reps will use daily.

## Status snapshot

| Gap | What it is | Status |
|---|---|---|
| A | Click tracking | ✅ Backend live (`track-email-click` + link rewriter); UI badges already render clicks |
| B | Bounce detection | ✅ Backend live; bounce pill already renders in `EmailsSection` |
| C | Reply detection | ✅ Backend stamps `replied_at`; "Replied" badge already renders |
| D | Mark inbound as read | ❌ **Not wired** — column exists, never written, no badge |
| E | Email templates | 🟡 Table seeded with 6 templates; **no picker, no manager UI** |
| F | Scheduled send | 🟡 Backend dispatcher + cron live; **no "Send later" picker in compose** |
| G | Per-user mailbox RLS | ⏸ Product decision pending — defer |
| H | Rate-limit retry | ✅ `fetchWithRetry` live |
| I | Image-proxy false opens | ✅ Filter live in `track-email-open` |
| J | Outlook | ⏸ Blocked on tenant admin — defer |
| K | Unanswered → ActionQueue | ✅ Already wired in `LeadActionsTab` priority list |

**Real work remaining: D, E, F.** Three tightly-scoped UI features. No new edge functions, no migrations.

---

## Work item 1 — Email templates (Gap E)

The 6 seeded templates are invisible today. Reps still type from scratch.

**Compose drawer changes (`EmailComposeDrawer.tsx`):**
- New "Insert template" dropdown above the Subject field, filtered by `lead.brand`.
- On select: load template, run variable interpolation, replace Subject + Body.
- Variables supported: `{{first_name}}`, `{{name}}`, `{{company}}`, `{{role}}`, `{{deal_value}}`, `{{stage}}`, `{{my_name}}` (from mailbox label).
- "Save as template" button next to "Save draft" — opens a tiny inline form (name + category) and inserts into `email_templates` with the current subject/body.
- After insert, `usage_count` increments on the chosen template (one-line update).

**Templates manager (new component `EmailTemplatesPanel.tsx` inside Settings):**
- New tab in `MailboxSettings.tsx` alongside Mailboxes / Unmatched: **Templates**.
- List view: name, brand, category, usage_count, last updated.
- Inline create / edit / delete with a simple drawer.
- Each row shows the variable tokens it uses (parsed from body).

---

## Work item 2 — Send Later (Gap F)

Backend dispatcher already runs every 5 min. Just needs a UI to enqueue.

**Compose drawer changes:**
- Replace single "Send" button with split button: **Send** + chevron menu.
- Menu options: Now (default), In 1 hour, Tomorrow 8am, Tomorrow 1pm, Pick time…
- "Pick time" opens a small popover with a date + time input.
- On schedule: insert a `lead_emails` row with `send_status='scheduled'`, `scheduled_for=<chosen>`, full message context (to/cc/bcc/subject/body_text/body_html), and `raw_payload = { connection_id, in_reply_to }`.
- Toast: "Scheduled for Tue, Apr 22 at 8:00 AM" with an Undo (5s) that deletes the placeholder row.

**Scheduled-queue surface (small addition to `EmailsSection.tsx`):**
- New collapsed strip at the top: "1 scheduled email" with expand-to-list.
- Each scheduled row shows recipient, subject preview, scheduled time, and a **Cancel** button (deletes the row).
- Realtime: subscribe to `send_status=eq.scheduled` for the lead.

---

## Work item 3 — Mark inbound as read + unread badges (Gap D)

`is_read` exists but no code touches it. Badge is impossible today.

**Read-state writes (`EmailsSection.tsx`):**
- When an `EmailRow` for an inbound email is expanded AND `is_read=false`, fire a single update: `UPDATE lead_emails SET is_read=true WHERE id=$1`.
- Update local state optimistically so the dot disappears immediately.

**Unread visual cues:**
- Inside `EmailRow`: small indigo dot to the left of the subject when `direction='inbound' AND is_read=false`.
- Subject in semibold (vs. regular) when unread.

**Unread count badge (lead detail header):**
- Tiny new query in `LeadPanelHeader.tsx`: `SELECT count(*) WHERE lead_id=$1 AND direction='inbound' AND is_read=false`.
- Badge next to the lead name, e.g. `2 unread`, monochrome `bg-secondary`, hidden at 0.

**Pipeline-card unread chip (optional, low-cost):**
- Extend `useUnansweredEmails` to also return `unreadByLead: Map<id, count>`.
- `Pipeline.tsx` already consumes the hook — show a small "2" chip on cards with unread inbound. Skip if it crowds the card; this is a stretch.

---

## What I am explicitly NOT doing

- **Gap G (per-user RLS)** — needs a product decision (each rep sees only their mailbox vs. all team mailboxes). Won't touch until that's answered.
- **Gap J (Outlook)** — blocked externally.
- **A/B subject testing, smart-send-time prediction, AI thread digests** — premature; need templates + clicks + replies producing real data first.
- **Click rewriting for `mailto:` and `tel:`** — already correctly skipped in the live rewriter.
- **Rich-text composer** — current plain-text + HTML conversion is fine for SDR-style emails.

## Files that change

| File | Change |
|---|---|
| `src/components/lead-panel/dialogs/EmailComposeDrawer.tsx` | Template picker, "Save as template", split Send button, schedule popover |
| `src/components/EmailsSection.tsx` | Unread dot + bold, mark-read on expand, scheduled-emails strip |
| `src/components/lead-panel/LeadPanelHeader.tsx` | Unread count badge |
| `src/components/MailboxSettings.tsx` | New "Templates" tab |
| `src/components/EmailTemplatesPanel.tsx` (new) | Templates list + inline CRUD |
| `src/hooks/useUnansweredEmails.ts` | Add unread-count map (small extension) |

## Order of execution

1. Templates (highest daily-rep impact — saves them typing every email).
2. Send Later (small UI, backend already runs).
3. Read state + unread badges (smallest change, finishes the inbox feel).

End state: composing an email becomes pick template → personalize → send now or schedule. Inbound emails clearly show what's new and what's been read. Settings holds both the mailbox health view and the team's reusable templates. After this, the email system is complete enough to stop iterating until real usage reveals the next bottleneck.

