

# Extend Upcoming Meetings to 30 Days with Toggle

## Problem
Meetings in the Action Queue hero section are capped at 7 days (`daysUntil <= 7` on line 109). User wants to see 14–30 days ahead.

## Approach
Add a small toggle in the "Upcoming Meetings" header: **7d / 14d / 30d** — defaulting to 14d. This controls the meeting horizon without cluttering the view.

## Changes in `src/components/ActionQueue.tsx`

### 1. Expand meeting window in `buildActionItems`
- Add a `meetingHorizon` parameter (default 14)
- Change line 109: `daysUntil <= 7` → `daysUntil <= meetingHorizon`

### 2. Add horizon state + toggle in main component
- Add `const [meetingHorizon, setMeetingHorizon] = useState(14)`
- Pass it to `buildActionItems`
- In the "Upcoming Meetings" header row, add 3 small toggle buttons: `7d | 14d | 30d`

### 3. Group meetings by week
When horizon > 7, group meetings visually:
- **This Week** — meetings within 7 days
- **Next Week** — 8–14 days
- **Later** — 15–30 days (only when 30d selected)

Each group is a horizontal scroll row of MeetingCards, with a subtle date separator label.

## Files Changed
| File | Change |
|------|--------|
| `src/components/ActionQueue.tsx` | Add meetingHorizon state, toggle UI, pass to buildActionItems, group meetings by week |

