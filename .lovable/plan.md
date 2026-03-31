

# Add Brand Logos to Fireflies Meeting Cards & Pipeline Meeting Indicators

## Problem
Meeting cards in the MeetingsSection and the Fireflies meeting count on pipeline cards don't show which brand (Captarget vs SourceCo) the meetings belong to. The colored left border exists on meeting cards but isn't enough for at-a-glance recognition.

## Changes

### 1. `src/components/MeetingsSection.tsx` — MeetingCard
Add `<BrandLogo size="xxs">` before the meeting title (line 731), using `meeting.sourceBrand`. This puts the brand logo inline next to the expand arrow and title, matching the pattern used everywhere else.

### 2. `src/components/Pipeline.tsx` — Fireflies meeting count
Currently shows just the Fireflies icon + count (lines 391-396). Enhance to show brand logos for the meetings. Since a lead can have meetings from both brands, show the count per brand or just the lead's own brand logo next to the Fireflies icon.

Simpler approach: Add the lead's `BrandLogo` before the Fireflies icon in the meetings indicator row, so you can see at a glance which brand's meetings those are. Since meetings already carry `sourceBrand`, if a lead has meetings from mixed brands, show both logos with individual counts.

### 3. `src/components/LeadsTable.tsx` — Side panel meetings
Verify meeting cards already show brand (they use MeetingsSection which has the border). Add BrandLogo to the meeting card title area if not already present.

## Files Changed
| File | Change |
|------|--------|
| `src/components/MeetingsSection.tsx` | Add `<BrandLogo size="xxs">` before meeting title in MeetingCard |
| `src/components/Pipeline.tsx` | Add brand-aware meeting indicators next to Fireflies icon |

