

# What you do: nothing. I'll run the cleanup sweep server-side and verify it worked.

## Confirmed reality (just queried)

| Lead | Emails attached | Actually involve them | Verdict |
|---|---|---|---|
| Kenneth Hall (CT-286) | 61 | **0** | All wrongly stapled — kenneth.finestcleaners@**gmail.com** triggered the personal-provider domain bug |
| Tyler Tan (CT-175) | 22 | **1** | 21 wrongly stapled — tyler120g@**outlook.com** same bug |
| Amy Steacy (CT-043) | 91 | 89 | Healthy — corporate domain, no pollution |

System totals: **1,153 claimed · 3,029 unmatched · 4,182 emails total.** The matcher fix already shipped; the *retroactive cleanup* never ran on the historical data.

## What I'll do (no clicks needed from you)

### Step 1 — Run `unclaim-bad-matches` server-side
Invoke the edge function via `curl_edge_functions`. Expected to un-staple ~150-300 wrongly-matched emails (Kenneth's 61, Tyler's 21, plus other gmail/outlook/yahoo personal-provider matches across the system). They flip back to `lead_id = 'unmatched'`.

### Step 2 — Run `rematch-unmatched-emails` server-side
Re-runs the now-correct 4-tier matcher (primary → secondary → stakeholder → unambiguous corporate domain only) over the freshly-unmatched pool plus the existing 3,029 unmatched. Personal providers (gmail, yahoo, outlook, hotmail, icloud) are blocklisted from domain fallback. Duplicate-lead matches get redirected to canonical via `duplicate_of`.

### Step 3 — Verify per-lead correctness
Re-run the same SQL spot-checks I just ran:
- Kenneth Hall should drop from 61 → 0 emails (he's never actually emailed Malik)
- Tyler Tan should drop from 22 → 1
- Amy Steacy should remain at ~89-91 (her data is clean)
- System-wide claimed count should drop, then partially recover from the rematch
- No claimed lead should have <50% participant-match ratio

### Step 4 — Show you the before/after report
A clean table you can verify against:

```text
                   Before    After    Status
Kenneth Hall          61        0     Fixed (was 100% pollution)
Tyler Tan             22        1     Fixed (was 95% pollution)
Amy Steacy            91       89     Unchanged (was clean)
Total claimed      1,153    ~1,000   Net cleanup
Unmatched          3,029    ~3,180   Grew from un-stapling (correct)
Avg participant-match  43%     ~95%   Match quality restored
```

If anything still looks wrong after the sweep, I'll dig into the specific lead and patch the matcher logic again.

## What you'll see in the UI after this lands

1. Open Kenneth Hall → Emails tab shows **"No emails yet"** (correct — he never emailed Malik)
2. Open Amy Steacy → still shows her 89 real emails
3. Open Unmatched Inbox → shows the genuinely-unmatchable threads, ready for manual triage
4. Going forward, every new Gmail sync (every 10min) routes correctly because the source matcher is already fixed

## Files touched

None — pure server-side data correction. Both edge functions already exist and are deployed.

