

# Add 2 Legitimate Missing Leads from HubSpot

## What We'll Do
Add the 2 clearly legitimate missing leads from the HubSpot export to the database. Skip the rest (spam, own employee, unrelated professionals).

## Leads to Add

| Name | Email | Company | Why Legitimate |
|------|-------|---------|----------------|
| Ramesh Dorairajan | (from CSV) | HGS - Hinduja Global Solutions | SVP Corp Dev & M&A, 25yr experience, ex-Tata Motors |
| Wasif Khan | (from CSV) | viaPhoton | CFO, ex-Madison Dearborn/Third Point/Morgan Stanley |

## Optional (needs your call)
- **Hannah Melotto** (melottogroup.com) — small copywriting agency, but active on deal platforms. Add or skip?

## Steps
1. Extract emails and details from the HubSpot CSV for these 2-3 contacts
2. Insert into `leads` table with brand=Captarget, stage=New Lead
3. Run score-lead on each to get tier/scoring

## Excluded
- **Valeria Rivera** — your own CAPTARGET employee
- **ANSAD AZIZ** — Aramco procurement, spam
- **Sophie Lane, Vicki Alderton, Alyssa Stone, Effie Wells, Jordan Mills** — no M&A relevance
- **8 no-name contacts** — spam/junk

