

# LinkedIn Icon Styling + Improve Match Rate

## Part 1: Make LinkedIn Icons Blue

The LinkedIn brand color is `#0A66C2`. Currently all LinkedIn icons use `text-muted-foreground`. Change to LinkedIn blue in all 4 locations:

### `src/components/LeadsTable.tsx`
- **Line 221** (lead detail header): Add a blue LinkedIn icon next to the name in `SheetTitle` row
- **Line 336** (Contact section): Make the icon blue `text-[#0A66C2]`
- **Line 1176** (leads table name column): Make the icon blue `text-[#0A66C2]`

### `src/components/Pipeline.tsx`
- **Line 375** (pipeline card): Make the icon blue `text-[#0A66C2]`

## Part 2: Improve LinkedIn Match Rate (86/191 → ~150+)

The current search queries `site:linkedin.com/in/ "Name" "Company"` but many companies have abbreviated/unusual names (e.g., "TVDCP", "Queenscourtcap", "DB", "Srs") that don't match LinkedIn profiles. Fix:

### `supabase/functions/backfill-linkedin/index.ts` + `supabase/functions/enrich-lead-scoring/index.ts`
Improve the `serperLinkedInLookup` function in both files:

1. **Two-pass search**: First try with company name. If no LinkedIn result found, retry **without** company (just `site:linkedin.com/in/ "Name"`)
2. **Check all 3 results** not just the first — find the first result whose link contains `linkedin.com/in/`
3. **Clean company names**: Strip common suffixes like "LLC", "Inc", "Corp" and expand obvious abbreviations before searching

### Re-run backfill
After deploying the improved functions, re-run `backfill-linkedin` to process the remaining 105 leads with the improved matching logic.

## Files Changed
- `src/components/LeadsTable.tsx` — Blue icons + icon next to name in detail header
- `src/components/Pipeline.tsx` — Blue icon
- `supabase/functions/backfill-linkedin/index.ts` — Improved matching
- `supabase/functions/enrich-lead-scoring/index.ts` — Improved matching (same logic)

