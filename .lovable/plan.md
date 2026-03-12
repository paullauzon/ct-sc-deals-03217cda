

# Plan: Add "Pre-Screen Criteria Completed" Field

## What is Pre-Screen Criteria?
In M&A deal sourcing, before investing time in meetings/proposals, a sales team runs a "pre-screen" — verifying the prospect meets minimum criteria (e.g., deal size threshold, geographic fit, acquisition strategy alignment, budget qualification). This yes/no flag tracks whether that gate has been passed.

## Changes Required

### 1. Database Migration
Add `pre_screen_completed boolean NOT NULL DEFAULT false` to the `leads` table.

### 2. Type System (`src/types/lead.ts`)
Add `preScreenCompleted: boolean` to the `Lead` interface in the Deal Management section.

### 3. DB Mapping (`src/lib/leadDbMapping.ts`)
Add `pre_screen_completed` ↔ `preScreenCompleted` mapping in all three functions (`leadToRow`, `rowToLead`, `leadUpdatesToRow`).

### 4. Lead Detail Side Panel (`src/components/LeadsTable.tsx`)
Add a checkbox/switch row in the "Deal Management" section (after the ICP Fit row) showing "Pre-Screen Completed" as a toggle. Uses the existing `Switch` component for clean yes/no UX.

### 5. Pipeline Cards (`src/components/Pipeline.tsx`)
Show a small "Pre-screened" indicator on pipeline cards when `preScreenCompleted === true` — a subtle checkmark badge in the value/priority row.

### 6. Fix Build Errors
- `ingest-email/index.ts` line 140: Cast `err` as `Error` → `(err as Error).message`
- `ingest-lead/index.ts` line 54: Fix typing on `generateLeadId` parameter
- `ingest-lead/index.ts` line 294: Cast `err` as `Error`

### 7. Edge Function (`ingest-lead/index.ts`)
Add `pre_screen_completed: false` to the new lead object.

