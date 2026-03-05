

# End-to-End Audit Results & Remaining Fix Plan

## What's Working
| Area | Status |
|------|--------|
| Today view — compact rows with left-border indicators | Working |
| Today view — Lucide icons replacing emojis in filter chips | Working |
| Dashboard — monochrome, standardized headings, no emojis | Working |
| Dashboard — "More Analytics" collapsible | Working |
| Pipeline — aging heatmap borders (yellow/orange/red) | Working |
| Pipeline — Lucide icons in closing insights (Zap, Target, Timer, BarChart3) | Working |
| Pipeline — compact cards | Working |
| Search bar — Linear-style ⌘K trigger in nav | Working |
| Command Palette (Cmd+K) | Working |
| Deal Room route (`/deal/:id`) — renders with 3-col layout, prev/next nav, sidebar auto-collapse | Working |

## Issues Found

### Issue 1: Deal Room is unreachable from the UI
Pipeline cards open the `LeadDetail` side panel (line 307: `setSelectedLeadId(lead.id)`). There is **zero navigation** to `/deal/:id` anywhere in the app. The Deal Room is an orphan page.

**Fix**: Add an "Open Deal Room" button/link inside the `LeadDetail` side panel header (in `LeadsTable.tsx`) that navigates to `/deal/${lead.id}`. This is the natural entry point — user opens side panel for a quick glance, clicks through to the full Deal Room for deep work.

### Issue 2: 111 emojis remain in 3 files
The previous edit only cleaned `ActionQueue.tsx`, `Pipeline.tsx`, `Dashboard.tsx`, and `DealRoom.tsx`. Three files still have emojis:

- **`LeadsTable.tsx`** (2 emojis): `🔄` submissions badge (line 205), `⚡` and `🎯` in shared intelligence (lines 1162-1165)
- **`DealIntelligencePanel.tsx`** (~20 emojis): `📊🎯🤝💡` comm style map (lines 22-25), `⚡🎯👥⭐🚫📅⚠️👤` throughout section headings and inline labels
- **`MeetingsSection.tsx`** (2 emojis): `👤` and `📅` in next steps (lines 449-450)

**Fix**: Replace all remaining emojis with Lucide icons in these 3 files.

### Issue 3: Dashboard still shows secondary sections above the fold
The plan called for moving Lead Volume, Brand Comparison, and Service Interest by Brand INTO the "More Analytics" collapsible. They're currently still visible in the main scroll, making the dashboard longer than necessary.

**Fix**: Move these 3 sections into the collapsible.

### Issue 4: Pipeline filter chips lack active state
Quick-filter presets (Needs Attention, Big Deals, etc.) don't visually indicate when active. The plan called for `bg-foreground text-background` inverted style.

**Fix**: Track which preset is active and apply inverted styling.

---

## Implementation Plan (4 changes)

### 1. Add "Open Deal Room" link to LeadDetail side panel
In `src/components/LeadsTable.tsx`, in the `LeadDetail` header area, add a button/link:
```
<Link to={`/deal/${lead.id}`}>Open Deal Room →</Link>
```
Import `Link` from `react-router-dom`.

### 2. Remove remaining emojis from 3 files
- **`LeadsTable.tsx`**: Replace `🔄` with `<RefreshCw>`, `⚡` with `<Zap>`, `🎯` with `<Target>`
- **`DealIntelligencePanel.tsx`**: Replace all ~20 emoji instances with corresponding Lucide icons (Zap, Target, Users, Star, Ban, Calendar, AlertTriangle, User, BarChart3)
- **`MeetingsSection.tsx`**: Replace `👤` with `<User>`, `📅` with `<Calendar>`

### 3. Move 3 dashboard sections into collapsible
In `src/components/Dashboard.tsx`, move Lead Volume, Brand Comparison, and Service Interest by Brand sections inside the existing "More Analytics" `<Collapsible>` block.

### 4. Add active state to Pipeline quick-filter presets
In `src/components/Pipeline.tsx`, track which preset is currently active and apply `bg-foreground text-background` class when active, `bg-secondary` when not.

