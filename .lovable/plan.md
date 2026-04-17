

## Build a Client Success pipeline + auto-handoff on Closed Won

### Concept
A **second pipeline** for the account-management team (Valeria), separate from the sales pipeline. When Malik marks a deal **Closed Won**, an account record auto-spawns in the Client Success pipeline at **Onboarding**, fully copied from the source deal. The 4 existing Closed-Won deals get backfilled into this pipeline.

### The 5 Client Success stages (from wireframe)
1. **Onboarding** — guide sent, kick-off scheduled, billing fields filled (48h SLA)
2. **Active** — service running, monthly check-in auto-task, renewal date tracked
3. **Renewal Due** — auto-flagged 60 days before contract end
4. **Paused / Credit** — service paused, reason + credit logged (30d resume task)
5. **Churned** — churn reason required, Malik notified

### Architecture

**New table `client_accounts`** (separate from `leads` — keeps sales pipeline clean):
```
id, lead_id (FK to source deal), brand, contact_name, company,
owner ('Valeria'), cs_stage, onboarded_date, contract_start, contract_end,
monthly_value (CT) | retainer_value (SC) | success_fee_pct (SC),
service_type, deal_amount, mandate_fields (jsonb),
pause_reason, pause_credit, resume_date,
churn_reason, churn_date, re_engage_date,
notes, created_at, updated_at
```
Plus `client_account_tasks` table (mirrors `lead_tasks` shape) for SLA + monthly + 60d auto-tasks.

**Auto-handoff trigger** (DB trigger on `leads` UPDATE where `stage` flips to `Closed Won`):
- Insert row into `client_accounts` at `Onboarding`, copying all relevant fields
- Insert 2 tasks for Valeria: "Send onboarding guide (48h SLA)", "Send Buyers Profile form"
- Skip if a `client_accounts` row for that `lead_id` already exists (idempotent)

**Auto-tasks (cron-driven)**:
- Active stage → monthly check-in task auto-creates each month
- Contract end - 60 days → flip to "Renewal Due" + create renewal task
- Paused → "Resume check-in" task at +30 days

### Top-level navigation

Add a **third system** to `SystemSwitcher.tsx` alongside Sales CRM and Business Ops:
- **Client Success** (icon: `HeartHandshake` or `Users`)

Inside that system: a single **Accounts pipeline** view (Kanban with the 5 columns), plus a `ClientAccountDetail` drawer showing source deal link, billing fields, contract dates, tasks, churn/pause forms.

### Files

**New**
- `supabase/migrations/<ts>_client_success.sql` — `client_accounts` + `client_account_tasks` tables, RLS, trigger fn `handle_closed_won()` for auto-handoff, backfill 4 existing Closed Won → Onboarding
- `supabase/functions/cs-cron-tasks/index.ts` — daily cron: monthly check-ins, 60d renewal flip, 30d resume tasks
- `src/components/ClientSuccessSystem.tsx` — top-level shell, mirrors `BusinessSystem.tsx`
- `src/components/ClientPipeline.tsx` — Kanban with 5 columns, drag-drop between stages
- `src/components/ClientAccountCard.tsx` — pipeline card (avatar, name, company, stage badge, renewal countdown, billing chip)
- `src/components/ClientAccountDetail.tsx` — drawer: source deal link, billing fields (CT/SC variants), contract dates, tasks, pause/churn forms
- `src/contexts/ClientAccountContext.tsx` — fetch/update client_accounts, real-time subscription
- `src/hooks/useClientAccountTasks.ts` — task CRUD
- `src/types/clientAccount.ts` — types

**Modified**
- `src/components/SystemSwitcher.tsx` — add "Client Success" option (3rd system)
- `src/pages/Index.tsx` — route `system === "client-success"` to `<ClientSuccessSystem />`, extend `System` type
- `src/components/lead-panel/LeadPanelRightRail.tsx` — for Closed Won leads, render a small "Linked Account" card with link to the CS pipeline entry (read-only for Malik)
- `.lovable/memory/index.md` — add Client Success pipeline memory entry

### Behavior

- **Malik marks deal Closed Won** in sales pipeline → DB trigger fires → CS account appears in Valeria's pipeline at Onboarding within seconds → 2 tasks waiting → toast notifies Malik "Account handed off to Client Success"
- **Pre-close validation**: if `subscription_value` (CT) or `subscription_value`+`success_fee_pct` (SC) is empty when stage flips to Closed Won, show a pre-flight modal warning ("Billing fields blank — Valeria's pipeline will be incomplete"). Soft warning for now (not blocking, per wireframe note "in the future make these required").
- **CS pipeline drag**: Valeria can drag between Onboarding → Active → Renewal Due → Paused → Churned. Churned requires a reason (modal, mirrors archive-with-reason pattern).
- **Backfill**: Migration inserts CT-001, CT-010, CT-043, CT-174 directly at **Active** (they're past onboarding) with their current `subscription_value` + `contract_end` populated. Owner = Valeria.
- **Right-rail "Linked Account" card** on Closed Won leads in the sales view → click opens the CS account drawer.

### Trade-offs
- **Win**: Clear separation of concerns. Malik's pipeline ends at Closed Won; Valeria's begins. Auto-handoff eliminates manual re-entry. Renewal timer + monthly check-ins drive retention.
- **Cost**: New table + trigger + cron + ~7 new components.
- **Risk**: Two sources of truth for "the customer" (lead + account). Mitigated by `lead_id` FK and a "Linked Account" card showing the connection both ways.
- **Out of scope (future)**: Required-field gating before Closed Won; Slack/email notifications to Valeria/Malik; renewal forecast revenue in Business Ops; per-account NPS.

### Verification
1. Open `Client Success` from system switcher → 5-column pipeline with 4 cards in Active (CT-001, CT-010, CT-043, CT-174)
2. Open sales pipeline → drag a deal to Closed Won → toast "Handed off to Valeria" → CS pipeline shows new card in Onboarding within 2s with 2 tasks
3. Open the linked account → source deal link works → billing fields pre-filled
4. Drag account to Churned → modal asks for reason → save → card moves; opening Malik's lead view shows "Account churned" badge
5. Future-dated test: contract_end set 60d out → cron flips to Renewal Due

