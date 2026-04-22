

# Email-attribution audit + system-wide fixes

## What I found across the whole DB

After scanning every lead-email row I found **only a handful of truly broken cases**, but several **systemic patterns** that need addressing now or they'll bite again. Headline numbers:

- **278 leads** have at least one attached email
- **107 rows** look "suspicious" at first glance (lead's primary email isn't in the participants), but **104 are legitimately attributed** via a registered secondary contact or stakeholder — the person at the firm we deal with isn't the form-filler
- **3 rows** are truly misattributed (only Nathan Hendrix CT-079 outbound to a banker — actually legitimate prospecting outreach about his deal; the other 2 are the Boyne billing thread I already moved to CT-369 yesterday)
- **22 leads** have stale `lead_email_metrics` (drift = 176 inbound, 37 outbound) — the trigger doesn't fire when `lead_id` is updated, only on insert
- **14 emails** are still attached to **3 duplicate leads** (`SC-I-004`→`CT-012`, `SC-I-013`→`CT-039`, `SC-I-016`→`CT-055`) instead of their canonicals
- **20,296 emails** sit in `unmatched` — most are noise but a portion are claimable with safe exact-email matching
- **5 corporate domains** are shared by 2+ active leads (`conniehealth.com`, `queenscourtcap.com`, `alturacap.com`, `teambigtable.com`, `boynecapital.com`) — domain-fallback claims on these would be ambiguous and must be blocked

## Two big architectural insights

### Insight 1 — "Personal-email primary, work-email correspondence" is real but rare
**CT-283 Philip DeCarlo** signed up with `pmdecarlo@yahoo.com` but actually corresponds from `pmdecarlo@eagle.partners` and his colleague `mdukas@eagle.partners` is on every thread. 13 of his 15 emails look "suspicious" but are 100% his deal. This is exactly the pattern your question anticipates. Solution: register `pmdecarlo@eagle.partners` and `mdukas@eagle.partners` as **secondary contacts** on CT-283 so future Tier-2 matches succeed cleanly. Only one lead in the entire DB has this pattern today.

### Insight 2 — "Same firm, unrelated to this prospect" handling is your real question
You asked: what about emails from the prospect's firm that are **not** about this deal? Example: Boyne's accounts-payable person Jessica Anaya emailing about Rob Regan's invoices — same domain, different person, different deal context. The right behavior is **never auto-claim by domain alone**. The current code already does this correctly (domain match requires a confirmed participant overlap), but I want to formalize a **third lane** between "matched" and "unmatched":

- A lightweight **`company_inbox`** view in the UI that surfaces unmatched emails grouped by sender domain when that domain is the primary domain of any active lead/client. Reps can one-click "claim to Lead X" or "leave in firm inbox" without those emails ever auto-attaching to the wrong deal.

This protects against the Boyne-billing failure mode permanently: if Jessica emails again, her email lands in unmatched, the UI surfaces "1 new email from @boynecapital.com — not yet attributed (Rob Regan, Benjamin Parrish are at this firm)", and the rep decides.

## The full plan — 6 corrections + 1 new surface

### 1. Backfill secondary contacts for CT-283 (the one lead with the work-email pattern)
Add `pmdecarlo@eagle.partners` and `mdukas@eagle.partners` as `secondary_contacts` on CT-283 so all 13 currently-stapled emails are now legitimately attributed via Tier 2, and any future Eagle Partners email auto-routes correctly.

### 2. Reassign emails from duplicate leads to their canonicals (14 rows)
- 8 emails: `SC-I-004` → `CT-012`
- 3 emails: `SC-I-013` → `CT-039`
- 3 emails: `SC-I-016` → `CT-055`

This is purely "follow the canonical pointer" — these duplicate leads exist but their email rows never got moved.

### 3. Recompute `lead_email_metrics` for the 22 drifted leads
Wipe and re-aggregate metrics for every lead whose `lead_email_metrics` row disagrees with the actual count in `lead_emails` (drift was caused by the trigger gap when `lead_id` is UPDATED rather than INSERTED).

### 4. Patch the trigger gap permanently (database migration)
Currently `update_lead_email_metrics_on_claim` only fires when an email moves from `unmatched` → real lead. Add a second branch so it ALSO fires when `lead_id` changes from one real lead to another (which is what happens on manual reassignment, duplicate consolidation, and merges). This eliminates future drift without anyone having to remember to recompute by hand.

### 5. Lock down all manual-claim paths to use exact-email match
The bug from yesterday (broad `ILIKE '%domain%'` claim) shouldn't have been possible. Add a **hard rule documented in the codebase memory** plus a small reusable SQL helper `claim_email_to_lead(email_id, lead_id)` that explicitly verifies at least one participant equals a known contact for the lead. All future manual sweeps go through this — broad domain claims become impossible.

### 6. One safe sweep of the unmatched bucket — strict exact-email match only
Run `rematch-unmatched-emails` once with the existing safe code path (it already enforces exact-email + confirmed-participant + non-personal domains). This will quietly claim the legit subset of those 20K unmatched rows without touching cross-contamination cases. Anything that doesn't pass the strict test stays in unmatched.

### 7. NEW — "Company Inbox" surface for the shared-domain problem
A small new section inside the existing Unmatched Inbox view that groups orphan emails by sender domain when that domain matches an active lead or client account's primary domain. Each group shows: domain, lead/client names at that firm, count of orphan emails, with one-click "Claim to {Lead}" or "Dismiss as firm noise" actions. This is the structural answer to your "should we put them somehow aside" question — emails like Boyne's billing dept stay quarantined in this lane until a human routes them, never silently auto-claimed.

No changes to live sync code (Gmail / Outlook syncs already implement the correct strict logic). No changes to `rematch-unmatched-emails` (it's already correct). The systemic fixes are: trigger patch + duplicate-email cleanup + 1 lead's secondary contacts + a guard helper + a new UI lane for the domain-ambiguity case.

## Technical execution (in default mode)

1. **Data correction (no code) — single SQL batch:**
   - Update `leads.secondary_contacts` for CT-283 (insert two contact entries)
   - `UPDATE lead_emails SET lead_id = canonical` for the 14 duplicate-attached rows
   - `DELETE FROM lead_email_metrics WHERE lead_id IN (drifted_set)` then `INSERT … SELECT COUNT(*)…` per lead

2. **Migration — patch the trigger:**
   - Modify `update_lead_email_metrics_on_claim` to also handle `lead_id_old <> lead_id_new` when both are real leads (decrement old lead's counters, increment new lead's counters). Keeps single-source-of-truth intact.
   - Add a second trigger covering DELETE so removed rows decrement metrics.

3. **Code — `claim_email_to_lead` helper:**
   - New `supabase/functions/_shared/claim-email.ts` exporting one function: `claimEmailToLead(supabase, emailId, leadId)` which verifies participant overlap before issuing the UPDATE. All future ad-hoc claims use this. Add a memory note enforcing the rule.

4. **Code — Company Inbox UI:**
   - Extend `src/components/UnmatchedInbox.tsx` with a "By Company" tab that groups unmatched emails by sender domain, joins to active leads/clients sharing that domain, and exposes `Claim to {Lead}` and `Dismiss` actions wired through `claimEmailToLead`.
   - No new tables — pure read-side aggregation over `lead_emails` + `leads` + `client_accounts`.

5. **Single safe sweep:**
   - `curl_edge_functions` POST to `rematch-unmatched-emails` with `{ limit: 5000 }` and report the resulting `matched / skipped / still_unmatched` counts back to you.

6. **Verification queries:**
   - Re-run the 4 probe queries above to confirm: 0 truly-misattributed, 0 metric drift, 0 emails on duplicates, CT-283 now showing 13/15 attributed via secondary.

