

# Fix Benjamin Parrish's incorrectly attributed emails

## What I found (deep investigation)

Benjamin's deal-room shows "3 emails" with "Last reply 394d ago." That is **wrong on every level**. None of the 3 emails are from or to Benjamin Parrish. They were swept onto his lead because my earlier UPDATE was too aggressive — it grabbed any orphaned `@boynecapital.com` email instead of only emails involving `bparrish@boynecapital.com`.

### The 3 emails currently attached to SC-T-071 (all incorrect)

| Date | From | To | Subject | What it actually is |
|---|---|---|---|---|
| Mar 24 2025 | **janaya@**boynecapital.com | billing@captarget.com | RE: CAPTARGET Receipts | Jessica Anaya (AP/billing) chasing receipts |
| Mar 21 2025 | **wguthrie@**boynecapital.com | m.hayes@captarget.com | DealMAX 2025 invitation | William Guthrie marketing blast |
| Mar 19 2025 | **janaya@**boynecapital.com | m.hayes@captarget.com | RE: CAPTARGET Receipts | Same Jessica receipts thread |

Two of these (Jessica/billing) actually belong to **Rob Regan's deal CT-369** — Rob is the Captarget client at Boyne and Jessica is his firm's accounts-payable contact. The third (William Guthrie) is a generic conference invite to Malik that never belonged to any deal.

### What's also wrong as a side effect
- "Last reply 394d ago" → it's not a reply, it's Jessica Anaya asking about receipts a year ago
- `lead_email_metrics` shows `total_received: 3, last_received_date: 2025-03-24` → all garbage
- The AI Suggests strip ("Benjamin replied 394d ago — awaiting your response") → **fabricated insight** based on Jessica's email being misattributed as Benjamin's reply
- 2 of these emails (the Jessica/billing thread) actually belong on **CT-369 / Rob Regan** but are now stolen from him

### Ground truth
- **Zero emails exist anywhere in the database from or to `bparrish@boynecapital.com`.** Confirmed by direct query — no row contains his address in `from_address` or `to_addresses`.
- This makes sense — Benjamin filled the SourceCo form for the **first time ever** today (Apr 22, 2026). He has never been emailed by us and never emailed us before this submission landed in Outlook 90 minutes ago.
- The actual Webflow form-submission email (the screenshot you sent at 16:51 today) sits in Outlook but hasn't synced into the CRM yet because **the Outlook deep-sync connection still hasn't been completed in Settings → Mailboxes**.

## The plan — three corrections

### 1. Reverse the bad sweep
- Move the 2 Jessica Anaya billing emails (`thread_id 195ac33715738718`) **back to CT-369 / Rob Regan** where they correctly belong (Jessica works for Rob's firm and the thread is about Rob's Captarget invoice payments)
- Move the 1 William Guthrie DealMAX email **back to `unmatched`** (it's a marketing blast to Malik, not a lead-bearing email — leaving it on Benjamin would also be wrong, and putting it on Rob would be wrong since it's addressed to a different person at Boyne)
- Reset `lead_email_metrics` for SC-T-071 to zero (no real emails yet)
- Recalculate `lead_email_metrics` for CT-369 to absorb the 2 emails being returned

### 2. Make Benjamin's panel reflect reality
After step 1, Benjamin's Emails tab will correctly show: "0 threads, 0 emails — no email history yet with Benjamin Parrish." The bogus AI insight ("Benjamin replied 394d ago") will disappear automatically because it's derived from the email rows.

### 3. Capture the real first email (the Webflow form notification)
The Webflow form submission email that triggered this whole episode (subject: "New Request - SourceCo", to: `sourceco@…`) is sitting in your Outlook inbox right now. The honest answer is: **we cannot pull it into the CRM until you complete the Outlook connect in Settings → Mailboxes** (which is the exact step that's queued up after Josh's admin approval).

Once Outlook is connected and the 90-day backfill runs, that form-notification email will sync in and either:
- Auto-match to SC-T-071 (because Benjamin's email address `bparrish@boynecapital.com` is in the form-submission body), **or**
- Land in unmatched and get claimed by the next sweep

I will **not** try to fabricate or hand-craft a stand-in record for that email — that's how we ended up with the current mess. The right answer is: zero is the truthful number until real sync runs.

## Why this happened (root cause + guardrail)

The earlier sweep used the SQL pattern `from_address ILIKE '%boynecapital.com%'` which is too broad — it matches every employee at Boyne, not just Benjamin. The correct pattern would have been `from_address = 'bparrish@boynecapital.com' OR 'bparrish@boynecapital.com' = ANY(to_addresses)`. Going forward, any manual email-claim must use **exact email match** on the lead's `email` field, not domain-level matching, because deal-bearing relationships are person-to-person not firm-to-firm.

## Technical execution (default mode)

1. `UPDATE lead_emails SET lead_id = 'CT-369' WHERE id IN ('7015de25-…', '9ce4ddaa-…')` — return Jessica's billing thread to Rob
2. `UPDATE lead_emails SET lead_id = 'unmatched' WHERE id = '68071d01-…'` — DealMAX blast back to unmatched
3. `DELETE FROM lead_email_metrics WHERE lead_id = 'SC-T-071'` — wipe bogus metrics (the trigger will recreate it cleanly when a real email arrives)
4. Recompute `lead_email_metrics` for CT-369 from scratch by re-aggregating `lead_emails` for that lead (since the trigger only fires on insert/update of the email row, not on lead_id changes — I'll do an explicit UPSERT with the full counts)
5. Confirm SC-T-071 shows 0 emails and CT-369 shows the corrected count

No code changes — pure data correction.

