
The user wants me to verify everything end-to-end. I've done a deep static + DB audit. Let me present a clean QA report with concrete pass/fail and a tight remediation plan. Read-only mode = I cannot fix anything, so this is a report + approval-gated plan to fix.

Key findings:
**Working / verified**
- TS build green (`tsc --noEmit` exit 0)
- DB schema all v4 columns present + `lead_stakeholders` table + RLS in place
- No runtime errors, no console errors
- All dialogs (Note/Task/LogCall/EmailCompose) wired into header + LeadDetailPanel
- Keyboard shortcuts wired (a/c/m/e/i/f/n/?, ⌘[ ⌘])
- Stakeholder CRUD card mounted, queries `lead_stakeholders`
- DealEconomics + MutualPlan + SourceAttribution all mounted in rails
- LeadStatus chip in header (only when ≠ "Working")
- Copy link + Copy summary + cheatsheet button wired
- Files tab Drive editor inline; Notes tab parses timestamped history
- Activity timeline already has filter pills + counts (built earlier in v3.5)

**Bugs / gaps I can confirm without running**
1. **Tab keyboard shortcut `c` collides with browser copy when text selected** — handler runs even when no text input is focused, so selecting a meeting/email line and pressing C jumps to Actions instead of letting Cmd-C work normally. Should ignore plain `c` if a non-input element has selection or if any modifier including the OS default is implied.
2. **`?` shortcut is Shift+/** — current code returns early when `e.shiftKey` is true (line 122), so `?` will NEVER open the cheatsheet despite the case in the switch. Bug.
3. **Stakeholder activity log** writes "Added stakeholder X" via `logActivity` with event_type `field_update` — UnifiedTimeline's `system` filter catches it correctly but treats it as generic. Minor: would be cleaner as a `stakeholder_change` type, but the filter still surfaces it.
4. **Stakeholder card defaults closed when 0 items** but the `+ Add first stakeholder` button is inside the body — invisible until user opens the card. Empty-state hint shows count = nothing, so user has no signal there's a card to expand. Should be `defaultOpen` always, or show count "0" and a small "Add" hint in header.
5. **DealEconomicsCard defaults open only if `lead.dealValue > 0`** — many older leads have $0 placeholder; card stays collapsed and the new MRR/Months/TCV/confidence UI is invisible by default. Should default open for active stages regardless.
6. **`InlineSelectField` for `Status`** — when `lead.leadStatus` is empty string from DB default behavior, it shows "Working" but on first save still writes "Working" to DB. Fine. But the Status row also lacks the colored chip styling we use in the header — visually inconsistent.
7. **`SourceAttributionCard` returns null when 0 submissions** — for Calendly-only leads (no form submission), the card silently disappears from the right rail with no signal that source data is "first contact = Calendly booking". A small graceful fallback would be valuable.
8. **`buildDealSummary`** uses `lead.lastContactDate` text; if a lead has only meetings/emails recorded but no `lastContactDate` set, the summary omits "Last contact" line — the header's `lastContactLabel` is also blind to meetings/emails. Should consider latest of meetings/emails too.
9. **`copySummary` requires clipboard permission** — on insecure preview iframes, `navigator.clipboard.writeText` can reject silently. We don't catch the rejection. Minor robustness.
10. **Email tab badge `(N)` only fetches once on mount** — if a new email arrives via the realtime channel inside `EmailsSection`, the panel header count doesn't refresh. Cosmetic but visible.
11. **`MeetingsSection` "Prep Brief" button** is plumbed and works, but there is no "Upcoming Meeting" sticky card surfacing the future Calendly booking — still on backlog from v3 plan, never shipped.
12. **`EmailsSection` has no "Compose" CTA in-tab** — all compose paths are via header button/Activity banner. A user landing on Emails tab has no obvious way to draft a new one.
13. **Stakeholder edit doesn't refresh `last_contacted` on email/call log** — promised in v4 plan ("auto-bumped when we log an email/call to that email address") but never implemented. Currently only manual via DB.
14. **No `ConfirmDialog` for Archive** uses `ArchiveDialog` (good) — but stage regression confirm uses `window.confirm()` (jarring, breaks design language same as the prompts we removed).
15. **`Mutual Plan` chips are read from comma-split text** — if user types "Houlihan, in-house corp dev" with a comma in the value itself (e.g. "Smith, Jones & Co"), the parser splits incorrectly. Edge case but very real for advisor names.

**Captarget/SourceCo workflow gaps still standing**
- No "Upcoming meeting" card on Meetings tab with prep brief CTA (v3 backlog item)
- No inline Fireflies transcript drawer (v3 backlog)
- Email compose drawer doesn't pre-fill stakeholder address selection (only uses `lead.email`)
- No way to mark a stakeholder as the deal's "primary champion" with a star — sentiment alone is fine but Fortune 500 CRMs surface The Champion specifically
- No "Snooze whole deal until X date" action — only `nextFollowUp` field

Plan: a focused fix pass for items 1-14 plus the Meetings "Upcoming meeting" card + Compose CTA in Emails tab. Skip items 15 / inline Fireflies drawer / champion star / snooze deal as separate follow-ups since each adds scope.

Keep concise.
