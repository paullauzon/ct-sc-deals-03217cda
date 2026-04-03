

# Pending Actions: Complete Sales Enablement Audit

## Current State

The pipeline card's action bar draws from **two separate systems** that don't talk to each other:

1. **Dropped Promises** (`getDroppedPromises`) — Action items extracted from meeting transcripts (e.g., "send proposal", "share case study") that are Open/Overdue. Shown as "3 pending actions".
2. **Playbook Tasks** (`lead_tasks` table via `useLeadTasks`) — Stage-triggered sequences (e.g., "Send recap & next steps", "Check-in if no response"). Used in Command Center tabs but **never shown on pipeline cards**.
3. **Next Best Action** (`getNextBestAction`) — A single AI-computed recommendation based on deal state. Only shown as fallback `doNext` text when no dropped promises exist.

**The problem**: Pipeline cards only show dropped promises count. A salesperson with 0 dropped promises but 3 overdue playbook tasks sees nothing. The "pending actions" bar is incomplete.

## What's Missing for Full Sales Enablement

| Signal | Currently Surfaced on Card? | Impact |
|--------|---------------------------|--------|
| Dropped promises (from transcripts) | Yes — count only | High |
| Playbook tasks (stage-based sequences) | No — only in Command Center | High |
| Next Best Action (AI engine) | Only as fallback text | Medium |
| Unanswered emails (no reply received) | No | Medium |
| Days since last contact | No (visible as "Xd in stage" but not as an action) | Medium |
| Prospect owes us something | Buried in Next Best Action logic | High |
| Follow-up date overdue | Date shown but no "overdue" signal | Medium |

## Proposed Solution: Unified Action Count

Merge all action sources into a single "pending actions" count on the pipeline card, with a richer tooltip breakdown so the salesperson knows exactly what's waiting.

### 1. Unified action count computation (`src/lib/dealHealthUtils.ts`)

New function `getUnifiedActionCount(lead, playbookTasks)` returns:
```
{ total: number, breakdown: { dropped: number, playbook: number, nextBest: boolean, overdueFollowUp: boolean } }
```

- `dropped`: Current `getDroppedPromises` count
- `playbook`: Count of pending `lead_tasks` for this lead (passed in)
- `nextBest`: Whether `getNextBestAction` returns a result
- `overdueFollowUp`: Whether `nextFollowUp` date is in the past

Total = dropped + playbook + (nextBest ? 1 : 0) + (overdueFollowUp ? 1 : 0)

### 2. Pipeline card integration (`src/components/Pipeline.tsx`)

- Fetch playbook tasks via `useLeadTasks` once for all visible leads
- Replace the current `dropped.length` check with `unifiedCount.total`
- Show: **"4 next steps"** instead of "3 pending actions" — "next steps" is more actionable language
- Add a **tooltip** on the action bar showing the breakdown:
  ```
  2 overdue commitments
  1 playbook task due
  1 follow-up overdue
  ```
- Keep the follow-up date on the right, but add **"overdue"** label when the date is past

### 3. Action bar text improvements

Current: `3 pending actions · Follow-up Mar 10`
Proposed: `4 next steps · Follow-up Mar 10` (or `4 next steps · Overdue Mar 10` if past)

When there's only 1 action, show the actual action text instead of a count:
- `Complete: "Send proposal"` (dropped promise)
- `Send recap & next steps` (playbook task)
- `Re-engage — 12d silent` (next best action)

This gives the salesperson instant context without clicking through.

### 4. Fallback hierarchy (when no dropped promises AND no playbook tasks)

Currently falls back to `winLose.doNext`. Enhance:
1. `getNextBestAction` result (most contextual)
2. `winLose.doNext` (deal intelligence)
3. Stage-aware default: "Advance to [next stage]" for stale deals

## Files Changed

| File | Changes |
|------|---------|
| `src/lib/dealHealthUtils.ts` | Add `getUnifiedActionCount()` function that merges dropped promises, playbook tasks, next best action, and overdue follow-up into one count with breakdown |
| `src/components/Pipeline.tsx` | Import `useLeadTasks`, compute unified count per card, show richer action bar with tooltip breakdown, show actual action text for single items, add "Overdue" label for past follow-up dates |

