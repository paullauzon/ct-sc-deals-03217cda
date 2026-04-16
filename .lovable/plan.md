
The user said "yes finish everything." I'm in plan mode so I need to present a concise plan to finish the merge. The remaining work is well-defined from prior context.

Key remaining work:
1. Update `LeadPanelRightRail.tsx` — add AI Insights card (Research, Suggested Updates, Auto-Find) + Submission History
2. Rewrite `LeadDetailPanel.tsx` — support `mode="sheet" | "page"`, drop Overview tab, add Actions + Debrief tabs, pass `save` to left rail, remove Deal Room link
3. Update `App.tsx` — `/deal/:id` mounts `LeadDetailPanel` in page mode
4. Delete `src/pages/DealRoom.tsx` and `src/components/lead-panel/LeadOverviewTab.tsx`

Need to verify a few things via read tools to make sure the plan is accurate but I have enough from prior context. Keep concise.

# Finish the Deal Room → Lead Panel merge

## Remaining work (4 files)

### 1. `src/components/lead-panel/LeadPanelRightRail.tsx`
Add two cards above the existing intelligence cards:
- **AI Insights** (top, default-open) — Research & Recommend button, AI Suggested Updates list (with accept/dismiss), Auto-Find Suggestions, Dossier (collapsed). Reuses `EnrichmentSection` + auto-find handlers extracted from the now-deleted Overview tab.
- **Submission History** — already wired below; keep as-is.

### 2. `src/components/LeadDetailPanel.tsx` (rewrite)
- Add `mode?: "sheet" | "page"` prop (default `"sheet"`)
- When `mode="page"`: render workspace directly (no Sheet wrapper, no overlay), full viewport
- When `mode="sheet"`: keep current `w-screen` Sheet wrapper
- Remove "Overview" tab; default tab becomes **Activity**
- Add tabs: **Actions** (hidden when stage is Closed Won/Lost/Went Dark) and **Debrief** (only when closed)
- Pass `save` to `LeadPanelLeftRail` (fixes the existing TS error)
- Move `DealHealthAlerts` banner to top of Activity tab
- Move enrichment / auto-find handlers from Overview into the panel itself (passed down to right rail's AI Insights card)
- Drop the "Deal Room ↗" header link button (header should expose an "Open as page" expand icon instead, which `router.push(/deal/:id)` from sheet mode)

### 3. `src/App.tsx`
Replace `<DealRoom />` import + route with a small inline `<LeadDetailRoute />` wrapper that:
- Reads `:id` from `useParams`
- Mounts `<LeadDetailPanel leadId={id} open mode="page" onClose={() => navigate(-1)} />`

### 4. Deletions
- `src/pages/DealRoom.tsx` (~1180 lines, all logic now in `LeadActionsTab` / `LeadDebriefTab` / panel)
- `src/components/lead-panel/LeadOverviewTab.tsx` (its content dispersed into left rail + activity banner + AI Insights card)

## Verification steps after build
- `/deal/:id` URLs still resolve (page mode)
- Opening a lead from Pipeline / Cmd+K / Action Queue shows the new panel (sheet mode)
- Inline edits in the left rail persist
- Actions tab renders priority queue + draft cards
- No TS errors

## Untouched
- `LeadContext`, edge functions, types, DB schema
- All 6 import sites — they call `<LeadDetail leadId open onClose />` unchanged
- `MeetingsSection`, `EmailsSection`, `DealIntelligencePanel`, `UnifiedTimeline`
