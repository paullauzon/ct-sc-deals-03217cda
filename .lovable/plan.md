

# Pipeline Search Feature

## What We'll Build

A sticky search bar at the top of the Pipeline view that filters deal cards in real-time across all stages. As you type, only matching cards remain visible — stages with no matches collapse to show "No matches." Clearing the search restores the full board.

## How It Works

- Search input with `Search` icon pinned above the pipeline columns
- Filters by: name, company, role, email, service interest, notes (case-insensitive)
- Matching is instant (no debounce needed for this data size)
- Keyboard shortcut: `Cmd/Ctrl+K` focuses the search input
- `Escape` clears the search and blurs

## Changes

### `src/components/Pipeline.tsx`
- Add `searchQuery` state
- Add a search `Input` with `Search` icon at the top, next to the existing header
- Filter `stageLeads` through the search query before rendering cards
- Add `useEffect` for `Cmd+K` keyboard shortcut
- Highlight matching stages count in the column header (e.g. "2 of 5" when filtering)

Single file change, ~30 lines added.

