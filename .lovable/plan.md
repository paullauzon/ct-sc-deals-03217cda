

# Fix Back Button Navigation + Audit Non-Intuitive Behavior

## Problem

The back arrow in DealRoom always navigates to `/` (root), which loads the Dashboard tab by default. When coming from Pipeline, the user expects to land back on Pipeline. `navigate("/")` ignores browser history.

## Audit Results

Only `src/pages/DealRoom.tsx` has this issue — two instances on lines 91 and 185. No other components use hardcoded `navigate("/")` for back navigation. The rest of the app uses hash-based view switching on the Index page, so there's no other back-button pattern to fix.

## Fix

Replace `navigate("/")` with `navigate(-1)` (browser history back) in both locations. This returns the user to wherever they came from — Pipeline, Leads table, Command Center, etc.

Edge case: if someone deep-links directly to `/deal/:id` with no history, `navigate(-1)` would leave the app. Add a fallback: check `window.history.length > 1`, if not, fall back to `navigate("/")`.

## Files Changed

| File | Changes |
|------|---------|
| `src/pages/DealRoom.tsx` | Lines 91 and 185: Replace `navigate("/")` with `navigate(-1)` with fallback to `navigate("/")` when no history exists |

