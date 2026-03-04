

# Add 2 Missing Recent Leads from CSVs

After cross-referencing all four CSVs with the database, I found **2 leads** from the last two days that are missing (the others — Nathan Hendrix, Shelby Craig, Bakari Akil, Abhinav Agrawal — are already in the DB):

### Leads to insert

1. **Leonardo Obodoeke** — `leo@cmbb.ca`, 03/04/2026, Captarget Contact Form, Corporate, cmbb.ca, phone: 6472264652, message: "Actively acquiring targets in the security and manufacturing space", deals planned: 0-2 → ID: `CT-080`

2. **Valentine Moroz** — `valentine@softinway.com`, 03/04/2026, Captarget Free Targets Form, Business Owner, softinway.com, target criteria about simulation software resellers, revenue $1M-$5M, geography: California, deals planned: 0-2 → ID: `TGT-021`

### Implementation
- Insert both leads directly into the `leads` table using the database insert tool
- They'll follow the same schema and defaults as existing leads
- Since they're new inserts, the realtime subscription will NOT fire (direct DB insert, not via the edge function), but the next page load will pick them up
- They won't be in the `seenLeadIds` localStorage set, so they'll show as "NEW" with badges

Note: I could only read the CSV content from the initial upload preview. The SourceCo Intro Call CSV header was too long to display any data rows, so if there are recent entries there beyond Abhinav Agrawal (already in DB), they wouldn't be visible to me. If you know of specific missing leads from that form, let me know.

