

# Manually ingest the missed Benjamin Parrish lead + diagnose the Zapier silence

## What just happened

A lead came in to `sourceco@…` at 16:51 (Webflow form, "New Request - SourceCo", `bparrish@boynecapital.com`) and:
- It is **not** in the database (most recent ingest was yesterday)
- It did **not** trigger Slack
- The `ingest-lead` edge function received **zero calls in the last 6 hours** (verified via edge-function logs)

This proves the failure is upstream of our system — the **Webflow→Zapier→ingest-lead Zap fired neither here nor to your Slack Zap**, which strongly points to:
- The SourceCo Zap being turned off / paused / out of tasks, OR
- Webflow not delivering to Zapier (form-submission webhook detached), OR
- A Zap error on Zapier's side after a recent edit

Either way, the lead exists only in the inbox screenshot. We need to add it manually now and get the entire enrichment pipeline (scoring, LinkedIn, follow-up task, email sweep) to run on it as if it had ingested normally.

## Plan

### 1. Inject the lead through `ingest-lead` (not raw SQL)

Call the edge function directly with the exact payload Zapier would have sent. This is the right path because it runs every downstream automation:
- Generates the next `SC-T-NNN` ID
- Creates the lead with full submission record (parses revenue / geography / sector from the message)
- Auto-flips `pre_screen_completed = true` (PE firm + revenue range + geography all present)
- Creates the **initial follow-up task** so it appears in Action Queue / Follow-Ups
- Runs **`score-lead`** (priority + ICP fit + scoring)
- Runs **`backfill-linkedin`** (finds Benjamin's LinkedIn profile)
- Runs the **unmatched-email sweep** — claims any prior `bparrish@boynecapital.com` emails sitting in the unmatched bucket and links them to the new lead

Payload extracted from the email body:
- brand: `SourceCo`
- source: `SC Free Targets Form` (matches the SourceCo target-sourcing intake pattern)
- name: `Benjamin Parrish`
- email: `bparrish@boynecapital.com`
- phone: `2105017688`
- companyUrl: `https://boynecapital.com/`
- role: `Private Equity` → auto-maps to buyerType `PE Firm`
- targetRevenue: `$10M-$100M`
- message: full thesis (Fund III, $400mm, North America, $3M-$15M EBITDA, founder-led, industry-agnostic, services / niche manufacturing / infrastructure / private label food)
- targetCriteria: founder/management-led platforms + add-ons
- geography: `North American`

### 2. Run a follow-up backfill pass

After ingest returns, immediately invoke `backfill-hydrate` for the new lead ID so company logo / website meta / firmographics populate alongside the LinkedIn enrichment.

### 3. Surface a diagnostic note in chat (no new code)

Once ingested, give you:
- The new `SC-T-NNN` ID + a direct link to the deal room
- A short Zapier-side checklist to find why the Zap is silent (Zap status, last run, task quota, Webflow webhook health)

### 4. No code changes

The `ingest-lead`, `score-lead`, `backfill-linkedin`, `backfill-hydrate` functions are already deployed and working — yesterday's leads went through them cleanly. We only need to invoke them with the missed payload.

## Technical execution

In default mode I will:
1. Call `supabase--curl_edge_functions` → POST to `/functions/v1/ingest-lead` with the JSON payload above + the `INGEST_API_KEY` bearer token
2. Confirm response shows `status: "created"` and capture the `leadId`
3. Call `supabase--curl_edge_functions` → POST to `/functions/v1/backfill-hydrate` with `{ leadIds: [<id>] }`
4. Run a quick `supabase--read_query` to verify the lead exists with scoring fields populated and an initial task was created
5. Report back with the lead ID, deal-room link, and the Zapier diagnostic checklist

