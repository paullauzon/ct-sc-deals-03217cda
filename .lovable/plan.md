

# Persist Navigation State Across Refreshes

## Problem
Both the top-level view (`dashboard`/`pipeline`/`leads`/`today`) and the Dashboard sub-tab (`overview`/`pipeline`/`team`/`buyers`/`intel`) reset to defaults on page refresh.

## Approach
Use URL hash parameters to persist state. On tab change, update the hash; on mount, read from it. This is better than `localStorage` because it also makes views shareable/bookmarkable.

Format: `#view=pipeline` or `#view=dashboard&tab=intel`

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Initialize `view` from `window.location.hash`, update hash on `setView` |
| `src/components/Dashboard.tsx` | Initialize `activeTab` from hash param `tab`, update hash on `setActiveTab` |

### Implementation Detail

**Index.tsx:**
- Parse `#view=X` on mount to set initial `view` state
- Wrap `setView` to also write `window.location.hash`
- Listen for `hashchange` event for back/forward browser nav

**Dashboard.tsx:**
- Parse `&tab=X` from hash on mount to set initial `activeTab`
- Wrap `setActiveTab` to update the hash (preserving `view=dashboard`)

This keeps both levels of navigation persistent with zero external dependencies.

