

# Fix: Auto-Find Meetings Not Getting AI Intelligence

## Root Cause

When Auto-find ran for Michael Tindall (Modern Distribution), the `run-lead-job` edge function found the meeting and saved it, but the `process-meeting` AI call **timed out** at 25 seconds. This is because:

1. The transcript is 44K characters (truncated to 25K by `process-meeting`)
2. `run-lead-job` enforces a **25-second timeout per meeting** (line 208) — too short for large transcripts with OpenAI tool calling
3. When `process-meeting` times out, the meeting is still added but with `intelligence: null`
4. Since no meeting has intelligence, `synthesize-deal-intelligence` is skipped entirely
5. Result: meeting shows up but with no Deal Intelligence panel, no structured insights, no CRM suggestions

The second issue: **there is no way to retry AI processing** for a meeting that was saved without intelligence. The user is stuck.

## Fix Plan

### 1. Increase per-meeting timeout in `run-lead-job`
Change the `process-meeting` call timeout from **25s → 50s** in `supabase/functions/run-lead-job/index.ts` (line 208). Large transcripts with structured tool output regularly need 30-40s.

### 2. Add a "Re-process" button for meetings without intelligence
In `src/components/MeetingsSection.tsx`, add a button on meetings that have a transcript but no `intelligence`. This calls `process-meeting` directly (like the existing Add Meeting flow) and updates the lead with the result. If all meetings now have intelligence, auto-trigger `synthesize-deal-intelligence`.

### 3. Fix the current broken lead (data repair)
Re-process Michael Tindall's meeting to generate the missing intelligence and Deal Intelligence synthesis. This can be triggered by clicking the new "Re-process" button, or we can run a one-time backfill.

### Files Changed
- `supabase/functions/run-lead-job/index.ts` — increase timeout from 25s to 50s
- `src/components/MeetingsSection.tsx` — add "Re-process" button for meetings missing intelligence

