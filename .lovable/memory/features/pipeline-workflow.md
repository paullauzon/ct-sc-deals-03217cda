---
name: Pipeline Workflow
description: 12 distinct pipeline stages with active (1-8), nurture (9), and terminal (10-12) groupings
type: feature
---
Pipeline workflow: 12 distinct stages:
1. New Lead
2. Qualified
3. Contacted
4. Meeting Set
5. Meeting Held
6. Proposal Sent
7. Negotiation
8. Contract Sent
9. Revisit/Reconnect (nurture — re-engagement after going cold)
10. Lost (renamed from "Closed Lost")
11. Went Dark
12. Closed Won (moved to final position)

Active stages (1-8): shown in deal progress bar.
Nurture stage (9): post-active but not terminal, still in pipeline.
Terminal stages (10-12): closed/inactive.

CLOSED_STAGES for pipeline value calculations: Lost, Went Dark, Closed Won.
ACTIVE_STAGES for progress bars: New Lead through Contract Sent.

"Long Term Follow Up" was removed — all leads from that stage were consolidated into Lost or Revisit/Reconnect.
