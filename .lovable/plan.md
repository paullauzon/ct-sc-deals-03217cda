

# Will Publishing Sync Data to Live?

## Short Answer: No — and here's why.

**Publishing deploys code and schema, never data.** The Test and Live databases are completely separate. Your 168 leads (and any enrichment/stage changes you've made in the Lovable preview) live in the **Test database only**.

## What happens when you publish:

| What | Synced to Live? |
|------|----------------|
| Code changes (edge functions, React components) | Yes |
| Database schema (table structure, RLS policies) | Yes |
| Database **data** (your 168 leads, enrichments, stages) | **No** |

## What will happen on Live after publishing:

1. The Live database's `leads` table will be **empty** (schema exists, no rows)
2. Your seeding logic in `LeadContext.tsx` will detect this and auto-insert the 168 **hardcoded** leads from `getInitialLeads()` — all with default stages ("New Lead"), no enrichment, no transcripts
3. Going forward, any changes you make on the live URL **will persist** in the Live database correctly

## Will changes on Live save properly going forward?

**Yes.** Once published, the live site runs the DB-backed code. Every stage change, enrichment, meeting, and processing result will persist in the Live database. Refreshing the page, closing the tab, using a different browser — all will show the same data.

## If you want your Test data on Live

You'd need to manually export data from the Test database and import it into the Live database. This requires running SQL in the backend admin. I can help with that if needed, but it's a separate step from publishing.

## Recommendation

1. **Publish now** to get the latest code on Live
2. The 168 leads will auto-seed with default values
3. Run "Process All" on the live site to re-enrich leads with transcripts and AI analysis
4. From that point forward, all Live data persists permanently

