

# Fix "Today" Action Queue — Broken Status Data & UX Clarity

## Problem

1. **"No contact in 999d"** — 7 leads in active stages (Proposal Sent, Meeting Held, Negotiation) like Barry Andrews, Natalie Schubert, Sascha van Holt, etc. have empty `last_contact_date` in the database. The ActionQueue code defaults to 999 days when this field is empty, producing nonsensical "Going Dark" alerts.

2. **Root cause**: When leads were advanced through stages (via bulk processing, AI suggestions, or manual updates), `last_contact_date` was never set. Only meeting additions update it — but many leads were moved to Proposal Sent without that field being touched.

3. **"Today" screen lacks clarity** — No explanation of what each category means or what action to take.

---

## Fix Plan

### 1. Backfill `last_contact_date` in the database
Run a migration that sets `last_contact_date` for all leads where it's currently empty, using the best available date:
- `meeting_date` (if they had a meeting)
- `stage_entered_date` (when they entered current stage)  
- `date_submitted` (last resort)

This fixes all 7 "999d" leads immediately.

### 2. Fix ActionQueue "Going Dark" logic
Update the code so that when `lastContactDate` is empty, it falls back to `meetingDate` → `stageEnteredDate` → `dateSubmitted` instead of defaulting to 999 days. This prevents future bogus alerts even if the DB field isn't set.

### 3. Auto-set `last_contact_date` on stage changes
In the lead update flow (`LeadContext.tsx`), when a lead's stage changes to any stage beyond "New Lead", automatically set `last_contact_date` to today if it's currently empty. This prevents the problem from recurring.

### 4. Improve "Today" screen UX
- Rename header from "Today" to **"Action Queue"** with a subtitle explaining: *"Leads that need your attention — overdue tasks, upcoming meetings, and pipeline risks"*
- Add small descriptive tooltips/labels for each filter category so the user knows what triggers each:
  - **Overdue**: Follow-up date has passed
  - **Meetings**: Meeting within next 7 days  
  - **Going Dark**: No contact in 21+ days (active deals only)
  - **Untouched**: New leads with no owner and no contact
  - **Renewals**: Contracts expiring within 30 days
  - **Stale**: Stuck in same stage 14+ days

### Files changed
- `src/components/ActionQueue.tsx` — fallback date logic, improved header/category descriptions
- `src/contexts/LeadContext.tsx` — auto-set `last_contact_date` on stage advancement
- Database migration — backfill `last_contact_date` for existing leads

