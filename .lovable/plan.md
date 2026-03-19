

# Add LinkedIn Indicators Across the App

## Problem
LinkedIn URLs exist in the DB (`linkedin_url`) but the Lead type and UI have no awareness of them. Need to surface LinkedIn profiles everywhere relevant.

## Where to Add LinkedIn

1. **Lead type + mapping** — Add `linkedinUrl` and `linkedinTitle` to the Lead interface and DB mapping
2. **Leads table** — LinkedIn icon next to the lead name (clickable link), similar to how DUP/NEW badges sit there
3. **Lead detail panel** — In the Contact section, add a LinkedIn field with clickable icon+link
4. **Pipeline cards** — LinkedIn icon next to the Fireflies icon in Row 4 (same pattern)
5. **Command palette search results** — Not adding here, would clutter; the other 4 locations cover all workflows

## Files Changed

### `src/types/lead.ts`
- Add `linkedinUrl: string;` and `linkedinTitle: string;` to the Lead interface

### `src/lib/leadDbMapping.ts`
- Add `linkedin_url` ↔ `linkedinUrl` and `linkedin_title` ↔ `linkedinTitle` to all 3 mapping functions

### `src/components/LeadsTable.tsx`
- **Leads table rows** (~line 1167): Add a LinkedIn icon (Lucide `Linkedin`) next to the lead name, linked to `lead.linkedinUrl`, only shown when URL exists. Muted when missing.
- **Lead detail Contact section** (~line 331): Add a LinkedIn field row showing the URL as a clickable link with icon
- Import `Linkedin` from lucide-react

### `src/components/Pipeline.tsx`
- **Pipeline cards Row 4** (~line 373): Add LinkedIn icon next to the Fireflies meetings icon, shown when `lead.linkedinUrl` exists. Simple linked icon, no count.
- Import `Linkedin` from lucide-react

### `src/contexts/LeadContext.tsx`
- Update realtime UPDATE handler to pick up `linkedin_url` and `linkedin_title` changes from DB
- Update `NewLeadDialog` defaults to include the new fields

