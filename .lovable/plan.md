

# Automate LinkedIn Profile Finding for All Leads

## Current State
The LinkedIn lookup code **already exists** in `enrich-lead-scoring` — it uses Serper.dev to search `site:linkedin.com/in/ "Name" "Company"` and extracts the profile URL + title. However, **0 out of 191 leads** have LinkedIn URLs because the `SERPER_API_KEY` secret was never added. The function silently skips LinkedIn lookup when the key is missing.

## Recommended Approach: Serper.dev (already integrated)

| Option | Accuracy | Cost | Integration Work |
|---|---|---|---|
| **Serper.dev** ✅ | Good (Google search) | ~$50/mo for 2,500 searches | **Already built** — just add API key |
| HeyReach | High | $79+/mo | Full new integration needed; designed for outreach, not lookup |
| Proxycurl | Very high | $0.01/lookup (~$2 for 191 leads) | New edge function + integration |
| Apollo.io | High | Free tier: 50/mo | New edge function + integration |

**Serper is the clear winner** — the code is already written and tested, it just needs the API key. HeyReach is designed for LinkedIn outreach campaigns, not profile enrichment.

## Plan

### Step 1: Add SERPER_API_KEY secret
Request you to add your Serper.dev API key (get one at serper.dev — free tier gives 2,500 searches).

### Step 2: Backfill existing 191 leads
Create a `backfill-linkedin` edge function that:
- Queries all leads where `linkedin_url IS NULL`
- Calls the existing Serper LinkedIn lookup logic for each
- Updates `linkedin_url`, `linkedin_title`, `linkedin_ma_experience`, and recalculates scores
- Processes in batches of 5 with rate limiting to stay within Serper limits

### Step 3: Automatic for new leads
Already handled — every new lead goes through `score-lead` → `enrich-lead-scoring` → Serper LinkedIn lookup. Once the API key exists, this runs automatically.

### Files Changed
- `supabase/functions/backfill-linkedin/index.ts` — New function to backfill all existing leads
- `supabase/config.toml` — Register the new function

