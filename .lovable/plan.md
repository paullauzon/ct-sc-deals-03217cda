

# Sequences — monitoring + AI-personalized nurture campaign

## What exists today (audit)

- `nurture-engine` edge function runs daily at 13:00 UTC (verified in `cron.job`), enrolls Closed Lost leads automatically (LeadContext L325-329), 283 leads currently `active`, fires 4 milestones (d0/d30/d45/d90) into `lead_drafts` and `lead_tasks`, flips to `re_engaged` on inbound, completes after d97.
- Activity tab already renders `sequence_paused` rows with inline pills (shipped last build).
- **Zero monitoring UI.** No "Sequences" page, no campaign overview, no per-step funnel, no enrolled-leads list.
- **Email copy is generic placeholder text** with no AI personalization. The mockup explicitly requires personalization by *Lost Reason + Mandate (Sector + EBITDA range + Acquisition Timeline + Firm Type)* and Malik's Day 45 manual touch references the Fireflies transcript.
- The mockup also requires logic the engine doesn't have: **9 lost reasons, 8 enrolled in S8, 1 (Scope Mismatch) gets a referral email and exits** — today every Closed Lost lead enrolls regardless of reason.

## What you'll get

A new top-level **Sequences** view (in the CRM nav, next to Pipeline) that is the single place to monitor every email sequence. The 90-day post-loss nurture is the first campaign — built so additional sequences (re-engagement, sample-sent stall, post-discovery cold, Closed Won onboarding, etc.) plug into the same UI with no rework.

### 1. Sequences index page (`/#view=sequences`)
List of all sequences as cards. For each: name, trigger condition, total enrolled (active / completed / re-engaged / exited), reply rate, conversion-to-meeting rate, last run timestamp, next run countdown. Click a card → campaign detail.

### 2. Campaign detail — "Sequence 8: Core 90-day post-loss nurture"

Three tabs:

**a. Overview**
- Trigger rule shown in plain English ("Lead enters Closed Lost with `lost_reason_v2 ≠ Scope Mismatch`")
- 4-step timeline (Day 0 / 30 / 45 / 90) matching your wireframe verbatim — each step shows: type pill (`AI-personalized` / `Auto` / `Malik manual`), subject template, body template with `[bracket]` merge fields, AI personalization inputs panel
- Funnel widget: Enrolled → d0 sent → d30 sent → d45 done → d90 sent → Re-engaged
- Summary stats: enrolled, active, completed, re-engaged %, replies, exited (Scope Mismatch referrals)

**b. Enrolled leads**
Sortable table: Lead · Lost reason · Day in sequence · Last touch · Next touch · Status · Replied? · Pause/Resume/Exit actions. Click a row → opens deal panel.

**c. Activity log**
Reverse-chrono feed of every send/skip/exit/re-engagement across all enrolled leads. Filterable by step (d0/d30/d45/d90) and outcome (sent/replied/exited).

### 3. Per-lead "Sequence" card in the deal panel right rail
On any Closed Lost lead: shows current step, day count, next touch date, replied status, and Pause/Exit buttons. Clickable header opens the campaign detail page filtered to this lead.

### 4. AI personalization (the actual "feel like a human relationship" upgrade)

Replace the static placeholder copy in `nurture-engine` with a new edge function `generate-nurture-email` (GPT-4o, direct OpenAI per your standing rule). For each milestone draft:

- **Day 0 inputs**: lost reason, target sector, EBITDA range, deal type, brand → produces an insight email that references their specific sector dynamics. Lost Reason → insight angle:
  - `Going DIY` → data-quality challenges insight
  - `Chose Axial` → off-market vs listed inventory dynamics
  - `Price was too high` → ROI/cost-per-deal math
  - `Timing` → market timing for their sector
  - `Went Dark / No response` → low-pressure relevance ping
  - `Other / Stale` → neutral sector observation
- **Day 30 inputs**: sector, EBITDA range, acquisition timeline → if timeline was "3-6 months" and 30 days have passed, explicitly acknowledges "you mentioned Q3 was when you'd be more actively deploying — is that still the plan?"
- **Day 45**: stays manual (Malik writes himself, no AI) — surfaces the Fireflies transcript link + Malik's notes inline so he can write something specific in 60 seconds. This matches your wireframe note: *"the Fireflies transcript is Malik's memory."*
- **Day 90 inputs**: firm type (PE fund / search fund / corp dev / family office) + sector + EBITDA → "We've helped [similar buyer type] source [X] targets in [range] recently."

All AI copy obeys your standing rules (max 80 words, no filler, no em/en dashes, peer tone). All emails sent from Malik's connected mailbox (Gmail/Outlook) via existing `send-gmail-email` / `send-outlook-email` so they look human.

### 5. Scope Mismatch exit branch
Engine adds a one-time `lost_reason_v2 == "Scope Mismatch"` check at enrollment: instead of `nurture_sequence_status = 'active'`, it generates a single referral email draft (Day 0 only, no further touches) and sets status to `exited_referral`. Tracked in the campaign detail's "Exited" bucket.

### 6. Activity tab integration (already mostly done)
Every nurture send adds a `sequence_step = 'N0' / 'N30' / 'N45' / 'N90'` to `lead_emails` so the existing inline `Nx paused on reply` chip + auto-task suffix works for nurture emails too — no extra timeline work.

## Technical details

- **DB**: add `nurture_step_log` (jsonb on `leads`) tracking `{step, sent_at, draft_id, email_id, replied}` per step. No new table needed; reuse existing `lead_drafts`, `lead_emails`, `lead_activity_log`, `cron_run_log` (already wired). Add `nurture_exit_reason` text column to `leads` for Scope Mismatch / manual exit.
- **New edge function**: `generate-nurture-email` (called by `nurture-engine` per milestone). Direct OpenAI GPT-4o, structured prompt per step with lost reason + mandate context.
- **Engine update**: `nurture-engine/index.ts` — add Scope Mismatch branch at top of loop, replace placeholder copy blocks with `generate-nurture-email` invocations, stamp `sequence_step = 'N{day}'` on the inserted `lead_drafts.action_key` and on the eventual `lead_emails.sequence_step` when sent (the existing send pipeline already carries `sequence_step` through).
- **Auto-enroll guard in `LeadContext`**: skip enrollment when `lostReasonV2 === 'Scope Mismatch'` (kick to referral branch instead).
- **Cron logging**: `nurture-engine` already runs daily; add `logCronRun` call (same pattern as `process-scheduled-emails`) so it appears in Automation Health panel.
- **New UI files**:
  - `src/components/sequences/SequencesIndex.tsx` (campaign list)
  - `src/components/sequences/CampaignDetail.tsx` (3-tab detail view)
  - `src/components/sequences/EnrolledLeadsTable.tsx`
  - `src/components/sequences/SequenceTimeline.tsx` (the 4-step visual matching the wireframe)
  - `src/components/lead-panel/cards/SequenceCard.tsx` (right-rail card on deal panel for enrolled leads)
- **Routing**: add `"sequences"` to the `View` type in `src/pages/Index.tsx` and a nav button (icon `Send` or `Workflow`).
- **Brand/aesthetic**: monochrome cards, no traffic-light colors except the existing amber pill for `sequence_paused`, badges in `bg-secondary`, lucide icons only — matches your standing design memory.

## Out of scope

- Building additional sequences beyond the 90-day nurture (the framework supports them — adding S5 sample-stall etc. is a follow-up)
- A/B testing on AI copy (single-variant first, can layer on later)
- Editing AI prompts from the UI (prompts stay in code for v1)
- Letting reps preview the AI-generated email *before* the cron fires (drafts still land in the existing Action Center for review/approve/send, same as today)

