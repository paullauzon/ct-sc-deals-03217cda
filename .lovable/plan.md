

# Verification: Email tab vs. mockup

## What was implemented from the approved plan ✅

| Plan item | Status | Where |
|---|---|---|
| Sequence step pills (e.g. `S6`, `S5-A`) | ✅ | `EmailRow` line 546-550, `ThreadCard` shows lead step on collapsed header |
| AI-drafted badge (`✨ AI`) | ✅ | `EmailRow` line 551-555, `ThreadCard` line 442-446 |
| Thread status pills — "Thread — no reply yet" / "{Name} replied" / "Auto-triggered" / "AI from Fireflies" | ✅ | `getThreadStatus()` line 46-62, rendered on `ThreadCard` header |
| Header rewrite — "All email threads — {Name} (N threads, M emails total)" | ✅ | Line 223-230 |
| "Individual rows ↔ Group threads" toggle | ✅ | Line 248-255, drives `flatten` state |
| Mailbox scoping badge (only when >1 mailbox) | ✅ | `multipleMailboxes` line 213, badge line 556-560 |

## Gap still missing from your original prompt ❌

Looking at the mockup once more, there is **one item from the original mockup that was deferred** in the approved build plan and never implemented:

### Gap 6 — "What appears here / What does NOT appear here" info banner

The mockup shows two prominent explainer cards at the top of the Email tab:
- A blue intro banner: *"The Email sub-tab shows only one-to-one emails between Malik and James, grouped into reply threads…"*
- A two-column card grid:
  - **What appears here**: every email Malik sent, every reply, threading rules, toggle behavior
  - **What does NOT appear here**: marketing, system auto-emails like S1-A (no-reply addresses), brand-mailbox sequences not from m.hayes@captarget.com

This was the lowest-priority item in the approved plan and was deferred. **It is the only remaining gap from the mockup.**

## Build plan — close Gap 6

Add a single, dismissable explainer banner to the top of `EmailsSection.tsx`, shown only on first view per user (persisted via `localStorage`).

### Files to touch

| File | Change |
|---|---|
| `src/components/EmailsSection.tsx` | Add `<EmailTabIntro />` component above `header`, dismiss persists to `localStorage` key `emailTabIntroDismissed` |

### Component shape

A compact, monochrome, dismissable card matching the project's premium aesthetic (no blue alarm color — use neutral `bg-secondary/30 border-border` per design standards):

```text
┌─────────────────────────────────────────────────────────────────┐
│  About this view                                          [×]   │
│  Shows only 1-to-1 emails between you and {Name}, grouped       │
│  into reply threads. Marketing, no-reply system emails, and     │
│  sequences sent from brand mailboxes appear in Activities only. │
│                                                                 │
│  Toggle "Individual rows" to flatten threads · "Show all" to    │
│  include marketing/transactional.                               │
└─────────────────────────────────────────────────────────────────┘
```

- Single combined banner (not two separate cards) — keeps the tab scannable
- Monochrome `bg-secondary/30`, no blue tint — adheres to the "no alarmist colors" memory rule
- `×` dismiss button → writes `emailTabIntroDismissed=1` to `localStorage`, hides forever
- Re-shows automatically if `localStorage` is cleared

### What the user gets

The Email tab now matches **every element** of the mockup. First-time users see a compact explainer that disappears after dismissal; returning users see the clean thread list directly.

## Out of scope (intentional)

- The mockup's mock tab strip ("Layout map / Left sidebar / Middle — overview / …") is the mockup file's own navigation chrome, not part of the email tab itself. Not implemented (correctly).
- The mockup's blue banner color: replaced with monochrome to comply with the project's premium B&W aesthetic memory rule.

