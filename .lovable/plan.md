

# End-to-end audit — what actually still needs work

## Verified working ✅
| Area | Evidence |
|---|---|
| 9-stage v2 type union + normalization | Active, 0 legacy stages in DB |
| All 3 cron jobs live | enforce-stage-slas (15min), nurture-engine (daily 13:00 UTC), sync-fireflies (15min) |
| SLA rules firing | 151 pending, all 8 v2 rules wired |
| Nurture engine | 283 d0 + 54 d30 drafts, 40 d45 tasks. d90 missing because d90 leads = 0 (correct) |
| Closed Won handoff trigger | 0 closed-won leads missing CS account |
| Discovery triage | 44 stuck deals all have triage tasks |
| StageGateGuard wired into Pipeline drag-drop + click | Pipeline.tsx:1122 |
| 685 tasks + 337 drafts created in last 24h | Engines are firing |

## What still needs work

### Gap 1 — The core 91% problem is *still* structurally unsolved (CRITICAL)
`sample_sent_ever = 0`. **No deal has ever passed through Sample Sent.** The whole point of the rebuild. The Sample Sent stage exists, the gate exists, the playbook exists, but Malik has zero forcing function to actually use it. The 44 Discovery Completed deals have triage tasks, but those tasks have been sitting there — the triage UI was deleted earlier as "cleanup" so there's no inbox-style flow to clear them in one sitting.

**Fix:** Build a focused **Discovery Triage inbox** in Action Center — groups all 44 stuck deals, one-click "Promote to Sample Sent" (opens the StageGateGuard pre-filled) and "Close Lost" buttons. Same as the screenshot's "Work the 44 Discovery Completed deals" step 5.

### Gap 2 — 7 files still use legacy stage literals (analytics drift)
These silently miscount the 283 Closed Lost deals or hide the 90 Unassigned:

1. **`src/components/lead-panel/cards/ForecastCard.tsx:9-11`** — `LATE_STAGES` set is the old 5 legacy stages. Forecast card never renders for any v2 deal.
2. **`src/components/lead-panel/cards/DealEconomicsCard.tsx:58`** — `isClosed` check uses `"Lost" || "Went Dark"`. v2 Closed Lost deals show economics card open.
3. **`src/components/DashboardLossIntelligence.tsx:41,91-92,209`** — `lostLeads` filter and competitor check use legacy literals → entire Loss Intelligence dashboard reads 0 lost deals.
4. **`src/components/DashboardForecast.tsx:445,463`** — won/loss reason aggregation uses `=== "Lost"` → forecast reasons table empty.
5. **`src/components/IntelligenceCenter.tsx:46,294,416,500,1575`** — 5 places using `"Lost" || "Went Dark"` → Intelligence Center loss analytics blank.
6. **`src/components/lead-panel/LeadDebriefTab.tsx:32`** — only renders lostReason if stage is literal `"Lost"` (never).
7. **`src/components/lead-panel/cards/OpenTasksCard.tsx:12`** — priority bump only checks `"Contract Sent" || "Negotiation"` (both dead stages).
8. **`src/components/lead-panel/cards/SimilarWonDealsSection.tsx:6`** + **`LeadActionsTab.tsx:217`** — `isClosed` checks miss Closed Lost.
9. **`src/components/PipelineSnapshots.tsx`** — `stage_data` records the live stage string; if v2 deals are normalized to v2 names good, but rolling sparkline still references stage strings via `STAGE_WEIGHTS` (works but legacy keys are noise).
10. **`src/components/Pipeline.tsx:433`** — bulk-process discovery query: `.eq("stage", "New Lead")` → never matches the 90 actual Unassigned leads. Bulk processing of new leads is silently broken.
11. **`src/components/LeadsTable.tsx:582`** + **`src/data/leadData.ts:137,240`** — manual lead creation still sets `stage: "New Lead"`.
12. **`src/components/DashboardOperations.tsx:642`** — stale-deal filter checks `["Meeting Held","Proposal Sent"]` → misses Discovery Completed entirely.

### Gap 3 — `enforce_stage_v2_gates` DB trigger is detached
`SELECT COUNT(*) FROM pg_trigger WHERE tgname='trg_enforce_stage_v2_gates'` returns 0. The function exists but isn't bound to the leads table. Soft-warning gate audit (intended fallback when stage moves bypass the React UI) does nothing. Migration drop somewhere along the way. Fix: re-attach the trigger.

### Gap 4 — Bulk-process "New Lead" query is broken (bonus from Gap 2 #10)
Pipeline.tsx hot path for processing fresh inbound queries `stage = "New Lead"` which yields zero rows. The 90 actual Unassigned leads can't be bulk-processed. Single-line fix.

---

## Plan: 4 fixes in this order

### Fix 1 — Discovery Triage inbox (the real business value)
New component `src/components/lead-panel/DiscoveryTriageInbox.tsx`, mounted as a tab/section in `ActionQueue.tsx`. Lists all leads where `stage='Discovery Completed' AND sample_sent_date='' AND sample_outcome=''`. Each row: company, days stuck, last meeting date, three buttons:
- **Promote to Sample Sent** → opens StageGateGuard pre-filled with `sample_sent_date = today`
- **Close Lost** → opens StageGateGuard for Closed Lost
- **Snooze 3d** → adds 3 days to triage task due_date

### Fix 2 — Mechanical legacy-literal cleanup (12 files, ~30 line edits)
Replace every hardcoded stage literal with v2 helpers from `@/lib/leadUtils`:
- `=== "Lost"` / `=== "Went Dark"` → `normalizeStage(s) === "Closed Lost"`
- `=== "New Lead"` (in Pipeline.tsx:433, LeadsTable.tsx:582, leadData.ts:137,240) → `=== "Unassigned"`
- `LATE_STAGES` (ForecastCard) and `OpenTasksCard` priority check → use v2 stage names
- DashboardOperations stale filter → include Discovery Completed and Sample Sent

### Fix 3 — Re-attach the v2 gate trigger
Single migration:
```sql
DROP TRIGGER IF EXISTS trg_enforce_stage_v2_gates ON public.leads;
CREATE TRIGGER trg_enforce_stage_v2_gates
  BEFORE UPDATE OF stage ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_v2_gates();
```

### Fix 4 — Daily nurture self-mature cron
Right now `nurture-engine` only fires once per day at 13:00 UTC and only acts on leads currently past a milestone. As d30 leads age into d45 tomorrow, they get tasks. Already works — verified `missing_d45_tasks=0`. **No action needed**, was a stale concern from earlier. Skip.

---

## Out of scope (intentionally)
- `LEGACY_STAGES` array in `leadUtils.ts`, `STAGE_LABEL_MAP`, `dealPredictions.ts`, `meetingCoach.ts` legacy aliases — kept for historical data.
- The 17 Discovery Completed deals with meetings >30 days old — the Triage inbox surfaces them, Malik decides.
- Email sync — comes after this batch.

## Ship order
**Fix 2 (literals) → Fix 3 (trigger) → Fix 1 (Triage inbox)**

Cleanup first so the inbox renders against accurate stage data. Then the inbox is the visible payoff that finally clears the 44-deal graveyard and starts populating Sample Sent for real.

