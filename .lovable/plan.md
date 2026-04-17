
The user wants a deep end-to-end audit of where the lead panel stands NOW, after v4 + the bug-fix pass. They want me to find what still doesn't work, what's incomplete, what feels unfinished. Let me actually dig in.

Let me check the current state of key files to find real gaps.

Let me think about what's likely broken or incomplete given the implementation history:

**Already shipped (v4 + fixes)**
- Lead status separate from stage ✓
- Stakeholder CRUD ✓
- Deal economics card (MRR/months/TCV/confidence) ✓
- Mutual plan + competing bankers (with ; separator) ✓
- Source attribution with Calendly fallback ✓
- Copy summary, Copy link with fallback ✓
- AlertDialog for stage regress ✓
- ? cheatsheet, c text-selection guard ✓
- Email compose with stakeholder chips + auto-bump ✓
- Log call with stakeholder bump ✓
- Upcoming meeting card ✓
- Email tab realtime badge + Compose CTA ✓
- pinned_at column on lead_activity_log (migration ran)

**Likely still broken / incomplete (educated guesses I should verify)**

1. **pinned_at column was added but Pin UI was never built** — the migration shipped, no UI wired. Dead column.
2. **`dealNarrative` field exists but no enrichment writes to it** — header shows nothing because the field is always empty. The chip was promised in v4 plan but never wired (only `copySummary` was built).
3. **Activity timeline filter pills** — built earlier in v3.5 supposedly, but the v4 plan reaffirmed P0 status. Let me verify it actually exists and works for: Search input, Collapse/expand all, Date range picker. I bet only filter pills exist, not search/collapse/date.
4. **Right-rail collapse button** — promised, probably not shipped.
5. **Density toggle** — promised, probably not shipped.
6. **Sticky tab bar** — probably not shipped.
7. **"Last activity" chip alongside "Last contacted"** — promised, probably not.
8. **Risk register CRUD** — was display-only in v4 plan, still display-only.
9. **Stakeholder card** — does the empty state actually show "Add first stakeholder"? Sentiment select working? Last_contacted format readable?
10. **DealEconomicsCard** — does TCV format right? Does saving confidence work? Default open for active stages now (after fix) but does it look right?
11. **MutualPlanCard** — chip add/remove flow, Enter to add, Backspace to remove — actually working?
12. **SourceAttributionCard** — Calendly fallback rendering correctly?
13. **EmailComposeDrawer** — stakeholder chips load, click adds to To field, send bumps stakeholder — entire flow.
14. **MeetingsSection upcoming card** — only shows when `meetingDate` is in future. What about Calendly bookings stored in `calendlyBookedAt`? Does "Open in Calendly" link to actual Calendly URL or to event-type URL (those are different)?
15. **LogCall + Email auto-bump** — actually queries stakeholder by email match. What if email isn't in stakeholders? Just no-op silently — that's expected.
16. **Keyboard cheatsheet** — does it list ALL shortcuts including the new ones? Probably stale.
17. **Lead status chip in header** — only renders when ≠ "Working" per audit. Is that the right behavior? Probably should always show so user knows current status.
18. **AI Insights card** — was added in v3, does the Re-run button actually work?
19. **Open Commitments card** — pulls from where? Action items? Are these wired?
20. **"View all properties" expansion** — HubSpot pattern, never built.
21. **Field-level audit log feed** — promised in last summary as "next step", never built.
22. **Inline Fireflies transcript drawer** — backlog item, never built.
23. **Champion star** — was deferred as separate follow-up.
24. **Snooze whole deal** — deferred.
25. **Saved views at lead list** — out of panel scope, but worth flagging.
26. **The header has a lot — is it crowded?** — stage progress + status chip + last contact + copy link + copy summary + cheatsheet + maximize + close + prev/next + dropdown menu + archive + enrich. Check if it overflows on narrow widths.
27. **Tabs** — Activity, Actions, Meetings, Emails, Intelligence, Files, Notes, Debrief = 8 tabs. Does it overflow? Are counts shown on all? Is there mobile behavior?
28. **Notes tab** — was display-only timestamp parser. Can you actually add new notes via dialog? Yes via NoteDialog. But editing existing notes? Probably not.
29. **Files tab** — Drive folder editor inline. What about other file types? Just a Drive link, that's it. No actual file upload/preview.
30. **Debrief tab** — only shows for closed deals. Wired correctly?
31. **Realtime sync** — does opening a lead reflect updates from other users / processing jobs in real-time? lead_emails channel works. What about lead changes (stage, value, status)?
32. **Empty states everywhere** — when a brand new lead opens, what does the panel look like? Are all empty states friendly?
33. **Mobile responsive** — sheet on mobile? sidebar collapsible? Probably broken at narrow widths.
34. **Prev/next navigation order** — uses leads context order. What's that order? Created date? Stage? User probably expects current pipeline-filter order.
35. **SourceCo-specific surfacing** — hear_about_us, acquisition_strategy, buyer_type fields exist in DB. Where are they shown? Probably only in Intelligence tab. Should be in left rail for SourceCo brand.
36. **Captarget targets list** — should there be a "Target list deliverable" card? Currently no link to deliverables.

This is a lot. I should organize by severity. Let me be structured.

I'll deliver the plan in plan mode. Read-only. The plan should be a verification-then-remediation outline. The user asked "investigate extremely deep and test all END to end - verify what all doesn't work yet, what has to be finished, improved, made functional - everything."

So they want: (1) audit findings, (2) remediation plan. I should batch by category, mark severity, propose what to ship.

Keep it concise — < 10K chars. Structure:
- Audit method
- Findings grouped by severity (broken / incomplete / polish gaps / missing capabilities)
- Proposed v5 fix pass (focused 6-8 items)
- Explicitly deferred

Don't ramble. The user is sophisticated.
