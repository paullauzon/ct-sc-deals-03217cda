

# Collapse External Research into Expandable Sections

## Problem
The External Research section (Company Dossier, Prospect Profile, Pre-Meeting Ammunition, etc.) takes up too much vertical space in the lead detail panel, pushing down more actionable content like Deal Intelligence and Meetings.

## Approach
Make each research sub-section (Company Dossier, Prospect Profile, Pre-Meeting Ammunition, etc.) individually collapsible using the existing Collapsible component. The section header "External Research" stays visible with the Re-research button. Each sub-section defaults to **collapsed**, showing only its title — users expand whichever one they need.

### Changes: `src/components/LeadsTable.tsx` (EnrichmentSection, lines 572-661)

- Wrap each research sub-section (Company Dossier, Prospect Profile, Pre-Meeting Ammunition, Competitive Positioning, and the remaining fields) in a `Collapsible` with a `CollapsibleTrigger` showing the section title + a chevron, and `CollapsibleContent` containing the body text.
- All sub-sections default to collapsed (`open={false}`).
- AI Suggested Updates panel stays always-visible at the top (it's actionable).
- The "Researched on..." footer stays always-visible at the bottom.
- Each collapsible trigger shows a brief preview (first ~80 chars) when collapsed so users can scan without opening.

