---
name: Client Success Pipeline
description: Separate account-management pipeline (Onboarding → Active → Renewal Due → Paused → Churned), auto-handoff trigger from Closed Won, owned by Valeria
type: feature
---
A second top-level system ("Client Success" in the SystemSwitcher) for Valeria's account-management work, fully decoupled from Malik's Sales CRM.

## Stages
1. **Onboarding** — guide sent, kick-off scheduled, billing fields filled (48h SLA)
2. **Active** — service running, monthly check-ins
3. **Renewal Due** — auto-flagged 60 days before contract end
4. **Paused** — pause reason + credit captured (modal-gated)
5. **Churned** — churn reason required (modal-gated)

## Tables
- `client_accounts` — one row per won customer (1:1 with `leads.id` via `lead_id`). Owns billing fields (monthly_value, retainer_value, success_fee_pct), contract dates, pause/churn reason fields.
- `client_account_tasks` — onboarding SLA + monthly + renewal tasks (mirrors lead_tasks shape, FK with cascade delete).

## Auto-handoff
DB trigger `handle_closed_won` on `leads` UPDATE: when stage flips to "Closed Won", inserts a client_accounts row at Onboarding (idempotent via UNIQUE on lead_id) and seeds 2 tasks: "Send onboarding guide (48h SLA)" + "Send Buyers Profile form".

## UI
- `ClientSuccessSystem` mounts `ClientAccountProvider` (real-time subscription to client_accounts) → `ClientPipeline` (5-column Kanban with drag-drop, brand stripe on cards, MRR + active count KPIs).
- `ClientAccountDetail` drawer: source deal link (back to Sales CRM), stage selector with pause/churn modals, billing fields (CT/SC variants), contract dates, tasks list, notes.
- `LinkedAccountCard` in the lead right rail (Closed Won leads only) — bidirectional link from Sales CRM to CS pipeline.

## Backfilled
4 existing Closed Won deals (CT-001, CT-010, CT-043, CT-174) inserted directly at Active.
