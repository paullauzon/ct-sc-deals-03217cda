

# Next Steps Engine: Final Audit — Bugs + Missing Signals

## Bug: Double-Counting Action Items

`getDroppedPromises` (line 150-168) returns ALL open/overdue action items regardless of owner. `getUnifiedActionCount` then separately counts "they owe us" items (where owner = prospect name). Items owned by the prospect appear in BOTH counts, inflating the total.

**Fix**: `getDroppedPromises` should exclude prospect-owned items (those are "they owe us", not "we dropped the ball"). Filter to items where `owner !== lead.name`.

## Missing Signals We Have Data For

### 12. Contract Renewal Approaching (Closed Won only)
`contractEnd` is tracked. `DealPulseTab` already surfaces renewals within 60 days. But Closed Won cards in pipeline show zero actions. A salesperson managing renewals needs: "Renewal in 23d — start conversation". This is high-impact revenue retention.

### 13. Declining Sentiment Trajectory
`momentumSignals.sentimentTrajectory` is an array across meetings. If the trajectory goes `["Positive", "Neutral", "Cautious"]`, the deal is cooling. Currently only shown as "Stalling" momentum — but the sentiment decline is a distinct, more specific signal: "Sentiment declining — was Positive, now Cautious."

### 14. Multi-Submission (Repeat Form Fill = High Intent)
`lead.submissions` tracks multiple form entries. A prospect who submitted twice is showing urgency. If `submissions.length > 1` and they're still in early stages (New Lead/Qualified), the action is: "High intent — submitted X times, prioritize outreach."

### 15. No Meeting Outcome Logged
If stage is "Meeting Held" but `meetingOutcome` is empty, the rep forgot to log the outcome. Action: "Log meeting outcome." This is a data hygiene signal that keeps the pipeline clean.

## Revised Priority Order

```text
1.  Unanswered inbound email
2.  Dropped promises (OUR items only, not prospect's)
3.  Meeting prep needed
4.  Open objections
5.  Playbook tasks due
6.  They owe us something (prospect-owned items)
7.  Going dark — 7+ days silent
8.  No champion past Meeting Held
9.  Overdue follow-up date
10. Stale new lead — no first contact
11. Contract renewal approaching (Closed Won)
12. Log meeting outcome (data hygiene)
13. Sentiment declining across meetings
14. High intent — multi-submission
15. Next Best Action (catch-all)
```

## Files Changed

| File | Changes |
|------|---------|
| `src/lib/dealHealthUtils.ts` | Fix `getDroppedPromises` to exclude prospect-owned items. Add signals 11-14 to `getUnifiedActionCount`. Update `UnifiedActionCount` interface with new breakdown fields. |
| `src/components/Pipeline.tsx` | Remove `CLOSED_STAGES` filter from unified action bar so Closed Won leads show renewal signals. |

