

# Move Intel Into Dashboard as Sub-Tab

## What Changes

### 1. Dashboard gets a new "Intel" sub-tab after "Buyers"

In `src/components/Dashboard.tsx`:
- Add `"intel"` to the `DashboardTab` type: `"overview" | "pipeline" | "team" | "buyers" | "intel"`
- Add entry to `TABS` array: `{ key: "intel", label: "Intel", desc: "Signal Center" }`
- Import `IntelligenceCenter` component
- Add rendering block: when `activeTab === "intel"`, render `<IntelligenceCenter />`

### 2. Remove Intel as standalone top-level tab

In `src/pages/Index.tsx`:
- Remove `"intel"` from `View` type (back to 4 tabs: `"dashboard" | "pipeline" | "leads" | "today"`)
- Remove the Intel entry from `NAV_ITEMS`
- Remove `{view === "intel" && <IntelligenceCenter />}` render line
- Remove `Brain` icon import (no longer needed here)

### 3. Update Command Palette

In `src/components/CommandPalette.tsx`:
- Remove the standalone "Intel — Signal Center" navigation item
- The Intel content is now accessible via Dashboard sub-tabs, so no separate top-level nav entry needed

### Files Changed

| File | Change |
|------|--------|
| `src/components/Dashboard.tsx` | Add "intel" sub-tab after "buyers", import and render `IntelligenceCenter` |
| `src/pages/Index.tsx` | Remove "intel" from top-level nav, revert to 4 tabs |
| `src/components/CommandPalette.tsx` | Remove Intel navigation item |

