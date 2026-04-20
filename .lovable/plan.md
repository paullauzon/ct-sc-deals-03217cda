

# Finish email intelligence: Phase 4 + 5 tails

Close out the final two loose ends from the last approved plan so the email stack is 100% shipped.

## Phase 4 tail — Email tab polish

**1. Wire the expand/collapse all signal through EmailsSection**
The global "Expand all · Collapse all" toggle already exists in the header but doesn't propagate into `ThreadCard`/`EmailRow`. Thread the signal through props so clicking the toggle snaps every thread + every email row to the same state in one action.

**2. Latest-reply preview snippet under each thread title**
When a thread has an inbound reply, render a single subdued line right under the subject:
`Last reply · Apr 8 · "This is exactly what we're looking for…"` (truncated at 120 chars, prefers most recent `direction='inbound'` email's `body_preview`).

## Phase 5 tail — Stall trigger wired into SLA cron

Add one new rule to `supabase/functions/enforce-stage-slas/index.ts`:

| Rule | Fires when | Action |
|---|---|---|
| `proposal-sent-7d-silent-draft` | `stage = 'Proposal Sent'` AND `days_in_stage >= 7` AND no inbound email in last 7 days AND no existing pending stall draft | Invoke `generate-stage-draft` with `trigger='stall'` → drops a soft-nudge draft into `lead_drafts` (existing function already supports this via `STALL_PROMPT`) |

Uses the `lead_emails` table to check for recent inbound replies. Idempotent via the same 7-day dedupe window the other rules use. The draft shows up in the Actions tab with `Send · Edit · Discard`.

## Files touched

| File | Change |
|---|---|
| `src/components/EmailsSection.tsx` | Thread `expandAllSignal` prop into `ThreadCard` + `EmailRow`; add latest-reply preview line |
| `supabase/functions/enforce-stage-slas/index.ts` | Add `proposal-sent-7d-silent-draft` rule that invokes `generate-stage-draft` with `trigger='stall'` |

## End state

Clicking "Expand all" in the Email tab instantly opens every thread and every email body. Every proposal that goes 7 days without a reply automatically gets an AI-drafted soft nudge waiting in the Actions tab. The email intelligence layer from the last three sessions is fully shipped — overview, activity, email, and AI-triggered drafting all live and automated.

