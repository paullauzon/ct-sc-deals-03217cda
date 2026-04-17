

## Audit — 150 active leads (CT 76 + SC 74), excluding Lost/Revisit/Reconnect/Went Dark/Closed Won

### What landed last session vs. what didn't

| Item | Status | Detail |
|---|---|---|
| Auto-assign + auto-schedule New Leads | **WIN** | 100% assigned, 90/90 New Leads scheduled |
| Auto-create `lead_tasks` on New Lead | **WIN** | 90/90 New Leads have pending task rows |
| Backfill 11 legacy unassigned | **WIN** | 0 unassigned now |
| `serviceInterest` re-synthesis | **DID NOT RUN** | 0 of 46 intel-bearing leads have `serviceInterest` JSON key — button never clicked |
| `buyingCommittee → lead_stakeholders` promotion | **CODE BUG + NOT RUN** | 0 stakeholder rows. **Bug:** code assumed `buyingCommittee[]` array, but actual JSON is an object `{decisionMaker, champion, influencers[], blockers[], unknowns[]}` — even if clicked, it would no-op |
| Forecast card UI | **WIN (live)** | But 49/49 late-stage leads still empty — needs rep entry |
| AI-tier enrichment | **STILL 0%** (8th session) | 149/150 missing enrichment JSON, 450 empty cells |
| 8 stale-transcript leads | Confirmed structural | `transcript_len = 0` — needs Fireflies re-fetch (separate effort) |

### Five new findings (ranked by addressable lift)

**Finding 1 — Stakeholder promotion code is broken.** Last session's `bulk-process-stale-meetings` mode=service_interest tried to iterate `buyingCommittee[]` as array, but it's an **object**. Fix shape: read `decisionMaker` (string), `champion` (string), `influencers[]` (array of strings), `blockers[]` (array of strings) and insert one stakeholder row per non-empty name with appropriate `role` field (e.g., "Decision Maker", "Champion", "Influencer", "Blocker"). 46 leads → ~50–80 stakeholder rows.

**Finding 2 — Service Interest re-synth never triggered.** All 46 intel-bearing leads are missing the `serviceInterest` JSON key. 28 Meeting Held leads still show `service_interest = 'TBD'`. Code path exists but user hasn't clicked. **Add: auto-trigger this once at first Pipeline mount per session if backlog > 20**, instead of relying on the dropdown click. Still cheap (~$0.50, ~3 min background).

**Finding 3 — Pre-screen 0% across all 150 active leads.** Per `mem://features/deal-gating-prescreen`, `pre_screen_completed` gates qualification but no lead has been marked. 82/90 New Leads have form-tier dossier data (buyer_type / target_criteria / etc.) — enough to auto-flip `pre_screen_completed = true` when minimum fields are present. **Free, deterministic backfill.**

**Finding 4 — 49 late-stage leads (Meeting Held + Proposal Sent + Qualified) missing all 4 forecast fields = 196 empty cells.** ForecastCard ships, but the rep has to manually open every lead. **Add: a "Late-stage forecast gaps" filter chip in the Pipeline header** that surfaces only Meeting Held+ leads with empty forecast fields, so reps can sweep them in one sitting. Plus, **deal_value = 0 on 39 of 49 late-stage leads** — same surfacing surfaces both gaps.

**Finding 5 — 55 active leads missing LinkedIn URL** (37%). LinkedIn enrichment runs on ingest but didn't catch these (mostly older + Captarget New Leads). One-shot trigger of `backfill-linkedin` against the 55 missing would close this gap (~$1, runs in background).

### Plan

**Step 1 — Fix the `buyingCommittee` promotion code** in `bulk-process-stale-meetings/index.ts`. Read it as an object, insert rows per `decisionMaker` / `champion` / `influencers[]` / `blockers[]` with proper roles. Then run it (one click) — yields ~50–80 stakeholder rows across 46 leads.

**Step 2 — Auto-trigger service-interest re-synth** on Pipeline mount when `intel_svc_key < 20` (one-time per session, idempotent). Lifts service_interest from 15 → ~35 on Meeting Held without requiring a button click.

**Step 3 — Pre-screen auto-flip backfill.** SQL one-shot: `UPDATE leads SET pre_screen_completed = true WHERE archived_at IS NULL AND pre_screen_completed = false AND (buyer_type <> '' OR target_criteria <> '' OR target_revenue <> '' OR ebitda_min <> '' OR geography <> '' OR acq_timeline <> '' OR acquisition_strategy <> '')`. Expected: ~140 of 150 leads flip. Also extend `ingest-lead` to auto-set on creation when these fields exist on first submission.

**Step 4 — "Forecast gaps" filter chip in Pipeline header.** New chip surfaces leads in Meeting Held+ with any empty forecast field (`next_mutual_step` / `forecasted_close_date` / `close_confidence` / `forecast_category`) OR `deal_value = 0`. One-click reps can sweep all 49 in a sitting.

**Step 5 — Fire `backfill-linkedin` once for the 55 LinkedIn-missing active leads.** Existing function, just needs a Pipeline dropdown trigger.

**Step 6 — Update audit baseline** at `.lovable/audit/coverage-2026-04-17.md`.

### Files touched
- `supabase/functions/bulk-process-stale-meetings/index.ts` — fix `buyingCommittee` shape (object, not array) + role mapping
- `src/components/Pipeline.tsx` — auto-trigger service-interest re-synth on mount + new "Forecast gaps" filter chip + dropdown item to fire `backfill-linkedin` for missing
- `supabase/functions/ingest-lead/index.ts` — set `pre_screen_completed = true` when first submission carries dossier fields
- One-off SQL: pre-screen backfill + (after Step 1 deploy) one stakeholder promotion run
- `.lovable/audit/coverage-2026-04-17.md` — append Session 9

### Trade-offs
- **Win:** ~50–80 stakeholder rows surface in StakeholderCard (was 0). 28 Meeting Held leads gain real `service_interest`. ~140 leads pass pre-screen gating. Reps get a one-click forecast-gap sweep surface. 55 leads gain LinkedIn URLs.
- **Cost:** ~$0.50 for service-interest re-synth, ~$1 for LinkedIn backfill, ~$3 still pending for AI-tier batch when user clicks. Code: 1 function fix, 2 UI additions, 1 ingest tweak, 2 SQL one-shots.
- **Risk:** Auto-trigger on mount could surprise — gate it to fire only once per session via sessionStorage flag. Pre-screen flip is reversible. Stakeholder promotion is idempotent (only when no rows exist).
- **Loss:** None — all additive.

### Verification
1. SQL: `SELECT COUNT(*) FROM lead_stakeholders WHERE lead_id IN (active intel)` → **≥50** (was 0)
2. SQL: active `service_interest <> 'TBD'` rises 32 → ~60
3. SQL: `pre_screen_completed = true` rises 1 → ~140 across active set
4. Pipeline: "Forecast gaps" chip shows 49, clicking filters to those leads
5. Open CT-060 (Alex Cram, Meeting Held) → StakeholderCard shows Alex Cram (Decision Maker / Champion) + Michael Emanuelo (Influencer)
6. AI-tier still 0% until user clicks the Pipeline banner — separate user action

