

# Make the Mailboxes screen self-explanatory

## What's actually confusing today (screenshot-driven audit)

1. **"Where is Re-run matcher?"** — It exists, but it's two clicks away inside `Unmatched inbox` tab → header. There is no entry-point or visibility from the Mailboxes tab. A user who hasn't opened that sub-tab would never know it exists.

2. **The mystery rows ("Last: Last 90 days · 973 imported · 1 minute ago")** — these are `BackfillProgressPanel` recap lines for each connection, but they render as **standalone table rows with no mailbox label and no provider column populated**, so they look orphaned. The user can't tell which mailbox the "973 imported" belongs to.

3. **The action icons (cloud-down, refresh, trash)** — pure icons with `title=` tooltips. On macOS hover-tooltips are slow/unreliable. No labels.

4. **Nothing tells the user "what is this screen for"** beyond the one-line subtitle. No mental model of: *Live sync* (5-min cron) vs *Backfill* (one-shot history pull) vs *Matcher* (re-attribution sweep) vs *Unmatched inbox* (manual rescue).

5. **No surfaced status of the matcher itself**: how many emails sit in unmatched right now? When did the last sweep run? A user has to leave this tab to find out.

6. **The "in last 24h" number** (e.g., "1006 in last 24h") is unlabeled — could mean fetched, inserted, matched, or unmatched. It actually means "lead_emails rows touching this address created in the last 24h".

## What I'll build

### 1. Surface the matcher controls at the top of the Mailboxes tab — not buried in a sub-tab

A new compact **"Email matching"** strip sits below the heading, above the connections table. It shows:

- **Unmatched count** (live, e.g. "20,294 emails not yet linked to a lead") with a "Review →" link that switches to the Unmatched inbox tab
- **Last matcher run** (e.g. "Last sweep: 2h ago · matched 47 of 312")
- Two buttons that are currently only inside Unmatched inbox: **Re-run matcher** and **Run cleanup sweep**, each with a one-line tooltip explaining what they do

Both buttons reuse the exact same edge-function calls already in `UnmatchedInbox.tsx` (`rematch-unmatched-emails` and `unclaim-bad-matches` + rematch). Refactor: pull those handlers into a shared hook `useMatcherControls()` so the Mailboxes strip and the Unmatched inbox header use one source of truth.

### 2. Fix the orphan-row problem in the table

Currently `BackfillProgressPanel` is rendered as a **separate `<tr colSpan={5}>`** under each connection — visually it floats and reads as its own line. Change it to render **inside the connection row**, in the "Last synced" cell, beneath the existing "X in last 24h" line. So each connection becomes one cohesive block:

```text
adam.haile@sourcecodeals.com   Outlook   Active   Last synced: just now
Adam — SourceCo                                   1,006 emails in last 24h
                                                  Backfill: 90d · 973/973 done · 1m ago [Re-backfill ▾]
                                                  Show recent syncs
```

Same for the recent-syncs history — it expands inline beneath the row instead of becoming an extra table row that loses its parent context.

### 3. Label every action button

Replace the bare icon buttons with **icon + label**:
- ☁️↓ → "Sync now"
- ⟳ → "Refresh token"
- 🗑 → "Disconnect"

On narrow viewports keep icon-only with proper accessible labels via `sr-only`. The existing `title=` attributes stay as fallback tooltips.

### 4. Add a "How this works" disclosure

A collapsible explainer at the top (closed by default) that defines the four moving parts in plain language:

- **Live sync** — automatic every 5 minutes, pulls new mail
- **Backfill** — one-shot pull of historical mail (90d / 1y / 3y / all)
- **Matcher** — re-runs the routing logic on emails that didn't auto-link to a lead
- **Unmatched inbox** — emails the matcher couldn't confidently route, awaiting manual claim

Tied to the four-tab structure so the user can mentally map "this tab does X". One-time-dismissible (localStorage) so power users see it once and move on.

### 5. Clarify the "in last 24h" metric

Change the label from `1006 in last 24h` to `1,006 emails synced (24h)` — adds the word "synced" and the unit so the number is unambiguous.

## What I will NOT change

- No touch to sync, backfill, or matcher edge functions — they work correctly
- No new database tables or migrations
- No change to the auto-enroll-90d behavior on first connect (that's correct)
- No restructure of the four-tab layout — only additions inside the Mailboxes tab and a refactor of where existing buttons live

## Files

- **Edit** `src/components/MailboxSettings.tsx` — add Email-matching strip, restructure connection row to embed BackfillProgressPanel + history inline, label action buttons, add How-this-works disclosure
- **Edit** `src/components/UnmatchedInbox.tsx` — replace inline matcher-button handlers with the shared hook (no UX regression — the buttons stay where they are, just sourced from the hook)
- **New** `src/hooks/useMatcherControls.ts` — shared `rematchAll()` + `cleanupSweep()` + live unmatched-count + last-run-summary
- **No backend changes**

