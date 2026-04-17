

## Verification — Client Success Pipeline vs. wireframe

### ✅ Fully implemented
| Requirement | Status |
|---|---|
| Separate `client_accounts` + `client_account_tasks` tables | ✅ Created with RLS |
| 5-stage pipeline (Onboarding → Active → Renewal Due → Paused → Churned) | ✅ `ClientPipeline.tsx` Kanban |
| System switcher with "Client Success" as 3rd option | ✅ With `HeartHandshake` icon |
| Auto-handoff trigger on Closed Won (`handle_closed_won`) | ✅ Trigger live, idempotent |
| 4 won deals backfilled to **Active** (CT-001, CT-010, CT-043, CT-174) | ✅ All present with billing + contract dates |
| Drag between stages, churn requires reason modal, pause requires reason | ✅ |
| Detail drawer: source deal link, billing, contract, tasks, notes | ✅ |
| Linked Account card on Closed Won leads in sales view | ✅ |
| Active MRR + active count KPIs | ✅ |

### ⚠️ Gaps vs. wireframe

1. **Backfilled accounts have ZERO tasks** — DB shows `client_account_tasks` is empty for the 4 backfilled rows. The trigger only seeds tasks on a *fresh* Closed Won transition, and the migration backfill skipped task seeding. Per wireframe, even Active accounts should have a recurring monthly check-in task.
2. **`LinkedAccountCard` navigation is broken** — uses `view=accounts` but `parseHashState` only accepts `dashboard|pipeline|leads|today`. Clicking goes nowhere visible. Also, no auto-open of the detail drawer when `account=<id>` is in the hash.
3. **Pre-flight billing-fields warning** before Closed Won is missing — wireframe explicitly calls this out as the #1 most important pre-close checklist item.
4. **"Account handed off to Valeria" toast** for Malik when he marks Closed Won is not surfaced anywhere in the sales pipeline UI.
5. **Onboarding stage has 2 SLA chips** in the wireframe ("Billing + dates required", "48h guide SLA") — column header just shows description text, not the visual SLA badges.

### Plan to close the gaps

**A. Seed Active monthly check-in tasks for the 4 backfilled accounts** (migration)
- Insert one "Monthly check-in" task per backfilled account due 30 days out so Valeria's queue isn't empty.

**B. Fix Linked Account navigation + auto-open drawer**
- `LinkedAccountCard.tsx`: change hash to `view=pipeline&sys=client-success&account=<id>` (Index already routes `client-success` regardless of view).
- `ClientSuccessSystem.tsx` / `ClientPipeline.tsx`: read `account=<id>` from hash on mount and open `ClientAccountDetail` for that ID. Clear the param on close.

**C. Pre-flight billing warning modal in sales pipeline**
- In the lead stage-change handler (where stage flips to "Closed Won"), if `subscription_value === 0` OR `contract_end` is empty, show a soft-warning modal: "Billing fields blank — Valeria's pipeline will be incomplete. Continue anyway?" with Cancel / Mark Won buttons.
- Find the stage-change call site (likely `Pipeline.tsx` drag-drop or `LeadPanelHeader` stage selector) and wrap with this guard.
- Show success toast: "Account handed off to Valeria — Client Success pipeline updated" after confirm.

**D. Visual SLA chips on column headers**
- `ClientPipeline.tsx`: add small badge row under each column header with the wireframe's chip labels:
  - Onboarding: "Billing + dates required" · "48h guide SLA"
  - Active: "Monthly task auto-creates"
  - Renewal Due: "60d auto-trigger"
  - Paused: "30d resume task"
  - Churned: "Churn reason required" · "Notifies Malik"

### Files to touch

**New migration**
- `supabase/migrations/<ts>_cs_backfill_tasks_and_polish.sql` — seed monthly check-in tasks for 4 backfilled accounts

**Modified**
- `src/components/lead-panel/cards/LinkedAccountCard.tsx` — fix hash format
- `src/components/ClientSuccessSystem.tsx` — read `account` hash param, pass to ClientPipeline
- `src/components/ClientPipeline.tsx` — accept `initialAccountId` prop, open drawer; add SLA chip rows under column headers
- `src/components/Pipeline.tsx` (or wherever stage drag-drop lives) — pre-flight modal on Closed Won transition + handoff toast
- `src/components/lead-panel/LeadPanelHeader.tsx` (if stage selector lives here) — same pre-flight modal

### Out of scope for this loop
- `cs-cron-tasks` edge function (60d renewal flip, monthly auto-task generator, 30d resume task) — separate request
- Required-field gating (hard block) — wireframe says soft warning is fine for now
- Email/Slack notifications to Valeria/Malik — UI toast only for now

### Verification after build
1. Open Client Success → 4 Active cards, each with 1 pending "Monthly check-in" task in the drawer
2. Open a Closed Won lead → click Linked Account card → CS pipeline opens with that account's drawer auto-open
3. Drag a non-Closed-Won deal to Closed Won with empty `subscription_value` → warning modal appears → confirm → toast "Handed off to Valeria"
4. Each CS column shows its SLA chips matching the wireframe

