

# LinkedIn Backfill Status Report

## Current State
- **79/191 matched** (41%) — 112 still missing
- The backfill ran but likely timed out before processing all leads (150s edge function limit)
- The **website scraper** (`backfill-linkedin-website`) was **never triggered**

## Breakdown of 112 Missing Leads

| Category | Count | Notes |
|----------|-------|-------|
| **Searchable** (business email + company) | 87 | Best candidates — should be re-run |
| **Personal email** (gmail/hotmail/etc) | 19 | Harder but some have company names |
| **Single name** (Jakub, Jama, PAWEL, Sahra) | 4 | Unfindable |
| **No company info** | 1 | Waranun Wachakorn — cornell.edu email only |
| **Spam** (a a / q.com) | 1 | Junk |

## What Still Needs to Happen

### 1. Re-run `backfill-linkedin` (multiple times)
The function processes in batches of 5 with delays, and times out at 150s. With 87 searchable leads, each needing up to 4-5 Serper queries, you need ~3-4 runs to finish.

**Serper cost estimate**: ~87 leads x 4 queries avg = **~350 credits** (you have 646 — enough)

### 2. Run `backfill-linkedin-website` 
71 of the missing leads have `company_url` values. This uses Firecrawl (free credits via connector), not Serper. Should run after the main backfill to catch stragglers.

### 3. Personal email leads (19) — partial coverage
Of the 19, about 8 have company names (Saffory, Oiioholding, Realtakai, etc.). The backfill already tries these with company+name search. The other 11 have no company — AI arbitration is their only hope.

## Truly Unfindable (~25-30 leads)

These will never match regardless of strategy:

1. **Single-name leads** (4): Jakub, Jama, PAWEL, Sahra
2. **Spam/junk** (1): "a a" with email a@q.com  
3. **No company + personal email** (~6): David Mathewd (mozmail), Edvin Bailey (gmail), Lisa Tuttle (gmail), Thomas Campbell (gmail), Tyler Sun (gmail), Tyler Tan (outlook)
4. **Non-English/very niche** (~5-10): Brijendra Singh at FinceptPro, Charles ALLAND (French company), some Middle Eastern names at tiny firms
5. **People who genuinely don't have LinkedIn** (~5-10): Small business owners, non-US professionals

## Realistic Final Estimate
- Current: **79 matched**
- After re-running backfill (3-4 times): **+20-30** → ~100-110
- After website scraping: **+5-10** → ~105-120  
- **Maximum achievable: ~120-130 / 191** (63-68%)
- **Genuinely unfindable: ~60-70** leads

## Plan: Execute in Order

### Step 1: Run `backfill-linkedin` 3-4 more times
Just invoke the function repeatedly. Each run picks up where it left off (queries leads with NULL linkedin_url). ~350 Serper credits needed.

### Step 2: Run `backfill-linkedin-website` once
Scrapes company websites for team page LinkedIn links. Uses Firecrawl, not Serper.

### Step 3: Final status check
Query the DB for remaining unmatched, categorize into "worth retrying" vs "truly unfindable."

### Files Changed
No code changes needed — just triggering existing deployed functions.

