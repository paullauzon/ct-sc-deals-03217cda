

# Fix: Research Enrichment Data Not Reflected in UI

## Root Cause

When "Research" completes, the code saves enrichment to the database via a direct Supabase update (line 461-464) but never updates the local React state. The realtime subscription in LeadContext only listens for scoring/linkedin/calendly fields — not `enrichment`. So:

1. DB write succeeds (data IS saved)
2. Toast fires ("Battle card saved")
3. The card still shows "No intel yet" because the lead object in React state has no enrichment
4. On full page refresh, the enrichment would appear (since it loads from DB)

## Fix

Two changes in `PrepIntelTab.tsx`:

### 1. After DB save, call `updateLead()` from LeadContext
Import and use `updateLead` to push the enrichment into local state immediately. This makes the card re-render with the battle card data (opening hook, discovery questions, value angle, watch outs) right after research completes — no refresh needed.

### 2. Check for errors on the DB update
The current `await supabase.from("leads").update(...)` ignores the response. Add error checking so failures surface properly.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Import `useLeads` context; call `updateLead(lead.id, { enrichment, enrichmentStatus })` after successful DB save; add error check on DB update result |

