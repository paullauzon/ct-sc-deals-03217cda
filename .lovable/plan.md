

## Unify Source, Submissions, Website Activity into one card

### Current state
Left rail in `LeadPanelLeftRail.tsx` renders three adjacent collapsible cards that all describe the same concept — how/where the lead came in and engaged:
- `SourceAttributionCard` (first/latest touch, channel mix)
- `Submissions` card wrapping `SubmissionHistory` (per-submission detail)
- `WebsiteActivityCard` (site URL, website score, future GA4)

This is redundant — same `lead.submissions` array drives all three.

### Approach
Replace the three cards with a single **"Source & Engagement"** collapsible card containing three internal sub-sections separated by hairline dividers:

1. **First / Latest touch + Channel mix** — content from `SourceAttributionCard`
2. **Submission history** — full per-submission timeline (the existing `SubmissionHistory` component, rendered inline already-expanded since it lives inside the parent collapsible)
3. **Website** — site URL, website score, and the GA4 "future" hint from `WebsiteActivityCard`

Card header shows total submission count as the badge. Icon: `Compass` (keeps the attribution metaphor).

### Files touched
- **`src/components/lead-panel/cards/SourceEngagementCard.tsx`** — new file, composes the three sub-sections internally. Reuses `SubmissionHistory` from `shared.tsx`.
- **`src/components/lead-panel/LeadPanelLeftRail.tsx`** — remove the three separate card renders (lines 180–193) and replace with `<SourceEngagementCard lead={lead} />`. Drop the `FileInput` import if no longer used elsewhere.
- **Delete** `SourceAttributionCard.tsx` and `WebsiteActivityCard.tsx` (no other consumers — verified by search).

### Behavior
- Single card, defaults closed (matches current pattern).
- Inside, the three sub-sections are always visible once the card is opened — no nested collapsibles, just labeled groups with `border-t border-border/40 pt-2` separators.
- `SubmissionHistory`'s own internal expand/collapse toggle is preserved so long histories stay compact.
- Falls back gracefully when there are no submissions (Calendly-only / direct-entry case from `SourceAttributionCard` is preserved).
- GA4 "future" hint stays so the slot is reserved.

### Trade-offs
- **Win:** One card instead of three → cleaner left rail, matches the screenshot's complaint.
- **Risk:** None — all data already flows through `lead.submissions` and `lead.companyUrl` / `lead.enrichment`.
- **Loss:** Submissions card no longer has its own top-level entry; users will find it inside "Source & Engagement". Acceptable per request.

### Verification
1. Open any lead with ≥1 submission → left rail shows one "Source & Engagement" card (with count badge), no separate Submissions / Website Activity cards.
2. Expand it → first/latest touch, channel mix (if >1 channel), submission history, website block all visible in one panel.
3. Open a Calendly-only lead (no submissions) → card still renders with the fallback first-touch block.

