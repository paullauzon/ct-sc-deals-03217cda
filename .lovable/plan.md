

# Plan: Persistent Notifications, Error Details, and Pause/Resume

## Changes

### 1. `src/contexts/ProcessingContext.tsx`

**Add pause/resume support:**
- Add `paused` flag to `BulkJobState`
- Add `pausedRef` to control the loop
- New `pauseBulk` / `resumeBulk` callbacks
- In the sequential loop, check `pausedRef` after each lead — if paused, await a promise that resolves when resumed
- Track failed lead errors in a new `failedLeads: Array<{name: string, error: string}>` field on `BulkJobState`

**When a job fails during bulk:**
- Capture the error reason from the job record and store it in `failedLeads`
- Do NOT auto-dismiss — keep phase as "done" until user manually dismisses

**Expose new methods:** `pauseBulk`, `resumeBulk` in context

### 2. `src/components/GlobalProcessingOverlay.tsx`

**While running:**
- Show Pause button (replaces Cancel position) + Cancel button
- When paused: show "Paused" state with Resume button
- No auto-close — overlay stays until manually dismissed

**When done/failed:**
- Overlay persists with "Dismiss" button (manual only)
- If there were failures, show expandable list of failed leads with their error reasons
- Use a collapsible section: "3 failed — click to see details" → expands to show each lead name + error string

**Remove any auto-dismiss behavior** — the overlay can only be closed by clicking Dismiss.

### Files
| File | What |
|------|------|
| `src/contexts/ProcessingContext.tsx` | Add `paused`, `failedLeads[]`, `pauseBulk`, `resumeBulk`; store error reasons on failure |
| `src/components/GlobalProcessingOverlay.tsx` | Add pause/resume buttons, persistent overlay, expandable error list |

