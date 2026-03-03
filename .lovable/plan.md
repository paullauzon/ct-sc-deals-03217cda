

# Widen Lead Side Panel & Enlarge Summary Field

## Changes

### 1. Widen the Sheet panel (`src/components/ui/sheet.tsx`)
The right-side sheet currently uses `sm:max-w-2xl` (~672px). Change to `sm:max-w-3xl` (~768px) for more breathing room.

### 2. Enlarge the summary preview in collapsed meetings (`src/components/MeetingsSection.tsx`)
Change the collapsed summary from `line-clamp-2` to `line-clamp-3` so more of the summary is visible at a glance without expanding.

### 3. Enlarge the expanded summary area (`src/components/MeetingsSection.tsx`)
Add `min-h-[80px]` to the expanded summary `div` so it doesn't feel cramped for short summaries, and bump text from `text-sm` to `text-sm` with slightly more padding.

| File | Change |
|------|--------|
| `src/components/ui/sheet.tsx` | `sm:max-w-2xl` → `sm:max-w-3xl` on right variant |
| `src/components/MeetingsSection.tsx` | `line-clamp-2` → `line-clamp-3` on collapsed summary; add `min-h-[80px]` to expanded summary div |

