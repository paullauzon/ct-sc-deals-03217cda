

# Command Center — Final Remaining Issues

## Critical Bugs

### 1. "Generate Prep Brief" is broken (PrepIntelTab.tsx)
**Root cause**: The button calls `supabase.functions.invoke("generate-meeting-prep", { body: { leadId: lead.id } })` but the edge function expects `{ meetings, leadFields, dealIntelligence }`. It receives no `meetings` array, so it returns `400: "No meetings to prepare from"`.

**Fix**: Rewrite `handleGeneratePrep` to pass the full lead data:
```
body: {
  meetings: lead.meetings,
  leadFields: { name, company, role, stage, priority, dealValue, serviceInterest },
  dealIntelligence: lead.dealIntelligence
}
```
Also: the function returns `{ brief }` but the UI doesn't do anything with it — it just shows a toast "Prep brief queued". The brief should be displayed in a dialog or inline on the card.

### 2. Follow-Up AI drafts are generic — edge function uses gpt-4o-mini
The `generate-follow-up-action` edge function uses `gpt-4o-mini` which produces bland, template-like output. With the rich context already being sent (enrichment, deal intelligence, psychological profile, meeting context), upgrading to `gpt-4o` would produce significantly more personalized drafts.

**Fix**: Change model from `gpt-4o-mini` to `gpt-4o` in `generate-follow-up-action/index.ts` line 158.

### 3. Draft Follow-Up edge function also uses gpt-4o-mini
Same issue in `draft-followup/index.ts` — uses `gpt-4o-mini`.

**Fix**: Upgrade to `gpt-4o`.

---

## UX Issues

### 4. Prep Intel: "Generate Prep Brief" result not displayed
Even if the API call succeeds, the generated brief (executive summary, action items, objections, talking points, questions, risks, desired outcomes) is never shown to the user. The toast just says "Prep brief queued".

**Fix**: After successful generation, display the brief inline on the card or in a slide-out Sheet — showing all structured sections: Executive Summary, Our Open Items, Their Open Items, Objections, Stakeholders, Competitive Threats, Talking Points, Questions to Ask, Risks, Desired Outcomes.

### 5. Follow-Ups: "Due This Week" section includes items due today that overlap
The `dueThisWeek` filter uses `!isBefore(d, now)` which includes today. But `startOfDay` was used for overdue, meaning items due today at a specific time could appear in BOTH sections or neither depending on parse timing.

**Fix**: Use `startOfDay(now)` consistently in `dueThisWeek` filter too: `!isBefore(d, startOfDay(now))` to include today in "Due This Week".

### 6. Schedule tab badge count says "2" but "Due Today" label shows blue correctly
This is working well now — no fix needed. Confirmed visually.

---

## Missing Features from Original Vision

### 7. No "Draft Follow-Up Email" button on Prep Intel cards
The original plan called for AI-powered follow-up drafting accessible from Prep Intel. Currently only "Generate Prep Brief" exists. For leads with past meetings, a "Draft Follow-Up" button would leverage the `draft-followup` edge function.

**Fix**: Add a secondary action button "Draft Follow-Up" on Prep Intel cards for leads with `meetingCount > 0`, opening the same ActionSheet from FollowUpsTab.

---

## Summary of Changes

| # | Fix | File | Severity |
|---|-----|------|----------|
| 1 | Fix Generate Prep Brief — pass full lead data instead of just leadId | `PrepIntelTab.tsx` | **Critical** — feature broken |
| 2 | Display prep brief results inline/sheet instead of just toast | `PrepIntelTab.tsx` | **High** — feature incomplete |
| 3 | Upgrade generate-follow-up-action to gpt-4o for better drafts | `generate-follow-up-action/index.ts` | **Medium** — quality |
| 4 | Upgrade draft-followup to gpt-4o | `draft-followup/index.ts` | **Medium** — quality |
| 5 | Fix dueThisWeek filter to use startOfDay consistently | `FollowUpsTab.tsx` | **Low** — edge case |

### Files Changed

| File | Changes |
|------|---------|
| `src/components/command-center/PrepIntelTab.tsx` | Fix handleGeneratePrep to pass meetings/leadFields/dealIntelligence; add PrepBriefSheet to display structured brief results; add state management for brief data |
| `supabase/functions/generate-follow-up-action/index.ts` | Change model from gpt-4o-mini to gpt-4o |
| `supabase/functions/draft-followup/index.ts` | Change model from gpt-4o-mini to gpt-4o |
| `src/components/command-center/FollowUpsTab.tsx` | Fix dueThisWeek filter to use startOfDay(now) |

