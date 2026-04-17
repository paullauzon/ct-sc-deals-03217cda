

## Audit — 150 active leads (CT 76 + SC 74), excluding Lost/Revisit/Reconnect/Went Dark/Closed Won

### Session 9 verification

| Item | Outcome | Evidence |
|---|---|---|
| Stakeholder promotion fix | **WIN** | 85 stakeholder rows across 45 leads (was 0). CT-060 → Alex Cram (Decision Maker) + Michael Emanuelo (Influencer) ✓ |
| Pre-screen backfill | **WIN** | 138/150 flipped (was 1) |
| Auto-task on New Lead | **WIN** | 94/150 leads carry pending tasks |
| Forecast Gaps chip | **Live** | But 0/49 late-stage leads have forecast fields filled — rep entry pending |
| `serviceInterest` auto-trigger | **DID NOT FIRE** | 0/46 intel-bearing leads carry the JSON key. 33 still TBD on Meeting Held |
| AI-tier batch | **STILL 0%** (9th session) | 1/150 enrichment, firm_aum/deal_type/txn_type all 0 |
| LinkedIn backfill | **NOT TRIGGERED** | 55 still missing |

### New findings (ranked by addressable lift)

**Finding 1 — `serviceInterest` auto-trigger silently failed.** Pipeline mounts, sessionStorage gates correctly, but **none** of the 46 intel-bearing leads have the JSON key. CT-060's `deal_intelligence` keys (verified) include `winStrategy`, `buyingCommittee`, `psychologicalProfile`, etc. — but no `serviceInterest`. Either: (a) the auto-trigger doesn't actually invoke `synthesize-deal-intelligence` (only the promotion step), or (b) the synthesizer prompt update from Session 7 isn't being honored. **Need to inspect `bulk-process-stale-meetings` mode=`service_interest` path** — likely only runs the promote step, never re-invokes the synthesizer.

**Finding 2 — 92 leads have overdue tasks, 89 are >7 days overdue.** The auto-scheduled `due_date = created_at + 1 business day` immediately produced overdue rows for 90 backfill tasks (created Apr 3–16, all due in past). Reps have no actionable surface — these all show as "very overdue" but no rep workflow is moving them. **Reschedule overdue New-Lead tasks** to a rolling near-future date (e.g., today + 1) and **add a one-click "Sweep all overdue New Leads" action** to the Pipeline that drafts initial-outreach emails in bulk via existing `draft-followup` path.

**Finding 3 — 96 leads tier 4-5 (94 t4 + 2 t5) — these tier values are non-standard.** Memory says Tier 1/2/3. 94 New Leads carry tier=4 (must be a default fallback or a legacy enum). They're scored (`stage1_score` = 100% coverage, `stage2_score` = 99%) but binned into a tier the UI doesn't render against. **Re-bin tier 4 → tier 3** (lowest in the standard scale) so they appear with proper priority badges in the Pipeline UI.

**Finding 4 — 12 of 44 Meeting Held leads have non-standard `service_interest` values** ("Full Market Coverage", "Full Platform (All 3)", "List Building") that don't match the synthesizer enum from Session 7 (`Off-Market Email Origination | Direct Calling | Banker/Broker Outreach | Targeted Buyer Search`). These look like rep free-text entries from before the column was constrained. **Normalize to the enum** ("Full Platform (All 3)" → keep as-is per `mem://business/service-offerings`, but add to enum; "List Building" likely = "Off-Market Email Origination"). Quick SQL.

**Finding 5 — 72 active leads have a `company` value but empty `company_url`.** Web-research, AI-tier enrichment, and competitive intel all need a domain. The auto-derive on ingest (URL from email domain) is too restrictive — only fires when not gmail/yahoo/etc. **Run a one-shot enrichment**: for each lead with company but no URL, derive from email's business domain, OR call `enrich-lead` to synthesize. Closes a large research-blocker silently.

**Finding 6 — 2 late-stage leads with zero meetings** (TGT-025 Amber Tobias = Qualified; CT-046 Mark Paliotti = Meeting Held, neither has fireflies_url). Stage was advanced manually without a meeting record. **Surface in a "stage-vs-evidence mismatch" diagnostic chip** — purely informational, not auto-revertible.

### Confirmed structural / out-of-scope (no action)
- 8 `transcript_len = 0` leads — Fireflies re-fetch
- AI-tier 0% — same blocker, banner already shipped, awaits user click
- 49 late-stage leads missing forecast fields — surface exists, rep entry pending

### Plan

**Step 1 — Fix the service-interest auto-trigger.** Inspect `bulk-process-stale-meetings` mode=`service_interest`. Ensure it (a) calls `synthesize-deal-intelligence` for each intel-bearing lead missing the `serviceInterest` JSON key, then (b) promotes to `service_interest` column. Add explicit log lines. Then re-trigger.

**Step 2 — Rebin tier 4/5 → tier 3.** SQL one-shot, also patch `enrich-lead-scoring` to clamp tier ∈ {1,2,3}.

**Step 3 — Reschedule overdue New-Lead tasks** to tomorrow business day. SQL one-shot. Add Pipeline dropdown action **"Reschedule overdue follow-ups"** for repeat use.

**Step 4 — Normalize 12 free-text `service_interest`** values to the enum where unambiguous. Manual SQL, conservative (leave "Full Platform" and "Full Market Coverage" since service catalog allows them).

**Step 5 — Backfill `company_url` for 72 leads** with company but no URL: one-shot SQL using email business domain when non-generic, then trigger `enrich-lead` for the remainder.

**Step 6 — Update audit baseline.**

### Files touched
- `supabase/functions/bulk-process-stale-meetings/index.ts` — verify + fix service_interest path (call synthesizer, not just promotion)
- `supabase/functions/enrich-lead-scoring/index.ts` — clamp tier ∈ {1,2,3}
- `src/components/Pipeline.tsx` — "Reschedule overdue follow-ups" dropdown action
- One-off SQL: tier rebin, task reschedule, service_interest normalize, company_url backfill
- `.lovable/audit/coverage-2026-04-17.md` — append Session 10

### Trade-offs
- **Win:** ~33 Meeting Held leads gain real `service_interest` (was stuck at 12). 96 leads gain proper tier display. 92 overdue tasks become actionable. ~50 leads gain `company_url` for research.
- **Cost:** ~$0.50 OpenAI (service_interest re-synth, this time really firing). Code: 1 function fix, 1 dropdown, 4 SQL one-shots.
- **Risk:** Tier rebin changes Pipeline ordering for 96 cards — reversible. Service_interest normalization conservative.
- **Loss:** None.

### Verification
1. SQL: `deal_intelligence ? 'serviceInterest'` on intel-bearing rises 0 → ≥40
2. SQL: `service_interest <> 'TBD' AND stage='Meeting Held'` rises 12 → ≥30
3. SQL: tier 4/5 count → 0 (all rebinned to 3)
4. SQL: overdue pending tasks for active leads → ≤10 (was 99)
5. SQL: active leads with company but no company_url → ≤20 (was 72)
6. Open CT-026 (Eric Lin, Meeting Held) → service_interest non-TBD; tier shows as 3 if previously 4

