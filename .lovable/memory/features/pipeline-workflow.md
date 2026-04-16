---
name: Pipeline Workflow
description: 13 distinct pipeline stages with active (1-8), nurture (9-10), and terminal (11-13) groupings
type: feature
---
Pipeline workflow: 13 distinct stages:
1. New Lead
2. Qualified
3. Contacted
4. Meeting Set
5. Meeting Held
6. Proposal Sent
7. Negotiation
8. Contract Sent
9. Revisit/Reconnect (nurture — re-engagement after going cold)
10. Long Term Follow Up (nurture — periodic quarterly touchpoints)
11. Lost (renamed from "Closed Lost")
12. Went Dark
13. Closed Won (moved to final position)

Active stages (1-8): shown in deal progress bar.
Nurture stages (9-10): post-active but not terminal, still in pipeline.
Terminal stages (11-13): closed/inactive.

CLOSED_STAGES for pipeline value calculations: Lost, Went Dark, Closed Won.
ACTIVE_STAGES for progress bars: New Lead through Contract Sent.
