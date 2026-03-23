

# Add Submission Timestamps to Leads Table

## Problem
The Date column shows only `dateSubmitted` (a plain date string like "2026-03-20") with no time component. The database has a `created_at` timestamp with full precision but it's not exposed to the frontend.

## Changes

### 1. Add `createdAt` to the Lead type and mapping
- **`src/types/lead.ts`**: Add `createdAt: string` to `Lead` interface
- **`src/lib/leadDbMapping.ts`**: Map `created_at` ↔ `createdAt` in `rowToLead`, `leadToRow`, and `leadUpdatesToRow`

### 2. Update the Date column display
- **`src/components/LeadsTable.tsx`**: 
  - Change the Date column to show `createdAt` formatted as "Mar 23, 2:15 PM" (date + time)
  - Update the sort for `dateSubmitted` key to use `createdAt` for proper chronological ordering
  - Default sort remains `dateSubmitted` / `desc` (newest first) — which already works

This gives you exact day and time each lead came in, sorted newest-first by default.

