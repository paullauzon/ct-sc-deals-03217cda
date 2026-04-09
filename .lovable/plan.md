

# Find Meetings for All New Leads

## What's Happening

There are **104 leads stuck at "New Lead"** with zero meetings and zero Calendly data. Two systems should be catching these:

1. **Calendly backfill** — matches Calendly bookings to leads by email. The function exists (`backfill-calendly`) but hasn't been run recently. It only matches by **exact email**, so if a lead submitted with one email but booked Calendly with another, it misses.

2. **Fireflies search** (via `run-lead-job` / Auto-Find) — searches Fireflies by email, name, domain, and company. This is more robust but currently only runs when you click Auto-Find on individual leads or use bulk processing.

## Plan

### 1. Run the Calendly backfill immediately

Deploy and trigger `backfill-calendly` with `?force=true` to scan all Calendly events from the last 90 days and match them to leads. This will advance any matched New Leads to "Meeting Set."

### 2. Trigger bulk Fireflies processing for unmatched New Leads

After the Calendly backfill, queue all remaining "New Lead" stage leads (those still without meetings) through the existing bulk processing pipeline (`run-lead-job`). This searches Fireflies by name, email, and domain — a wider net than Calendly's email-only match.

To avoid overloading Fireflies (rate limits), batch them in groups of 5 with delays between batches.

### 3. Add a "Find Meetings for All New Leads" button

Add a one-click button in the Pipeline view (or a bulk action) that triggers this combined Calendly + Fireflies scan for all New Leads at once, so this doesn't have to be done manually lead by lead again.

## Implementation

| Step | Detail |
|------|--------|
| Deploy + call `backfill-calendly` | Run it with `force=true` to re-scan all events |
| Queue remaining New Leads | Insert `processing_jobs` rows for all New Leads still without meetings, triggering `run-lead-job` for each |
| UI button | Add "Scan All New Leads" action to Pipeline filters or bulk actions bar |

## Files Changed

| File | Changes |
|------|---------|
| `src/components/Pipeline.tsx` | Add "Scan All New Leads" button that triggers bulk processing for all New Lead stage leads |
| `src/components/BulkProcessingDialog.tsx` | Support "all new leads" mode that queues every unprocessed New Lead |

