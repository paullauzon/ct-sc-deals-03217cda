

# Fix: Remove Fabricated Lead Response Time Metric

## The Problem

The "Lead Response Time" section shows 12d for Captarget and 5d for SourceCo. This metric is fabricated — it uses `lastContactDate` and `stageEnteredDate` as proxies for "time to first response," but neither field represents actual email response data. The system has no access to your inbox, so these numbers are meaningless and misleading.

## What's Actually Legitimate (everything else)

After auditing all 4 tabs, Lead Response Time is the **only** fabricated metric. Every other metric derives from real data:
- Scorecards: actual lead counts, deal values, subscription data
- P&L: from `business_cost_inputs` table + won deal revenue
- Stage Waterfall: actual stage distribution of leads
- Avg Cycle Days: `dateSubmitted` → `closedDate` on won deals
- Deal Velocity: from `lead_activity_log` stage_change events (shows empty if no logs)
- CAC/LTV/Payback: from cost inputs + won contracts
- Pipeline metrics: from actual lead stages, values, dates

## The Fix

**Remove the `LeadResponseTime` component entirely** from `DashboardBusiness.tsx`. It cannot produce accurate data without actual email integration (e.g., reading send/reply timestamps from `lead_emails` table or a connected inbox).

**Future option**: Once you have enough email data flowing through the Zapier→`ingest-email` pipeline, this metric could be rebuilt using actual email timestamps from the `lead_emails` table — measuring time between first inbound email and first outbound reply. But until that data exists, showing N/A or removing it is the honest approach.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/DashboardBusiness.tsx` | Remove `LeadResponseTime` component and its usage (~45 lines) |

