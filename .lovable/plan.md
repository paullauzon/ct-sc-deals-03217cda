

# Design Refinements: Hierarchy, Clarity, and Intuitiveness

## Issues Identified

After reviewing all three views (Dashboard, Leads, Pipeline), here are the design improvements grouped by impact:

---

### 1. Navigation: Lacks visual weight and brand presence
**Current**: Plain text "CAPTARGET" with small pill buttons in a thin 48px nav bar.
**Fix**: Increase nav height slightly to 56px. Make brand text bolder (font-bold instead of font-semibold). Add subtle bottom-shadow separation instead of just border. Keep the active tab style but use a subtle underline indicator instead of filled pill for a cleaner, more editorial feel.

---

### 2. Dashboard: Hero metrics lack visual punch
**Current**: Three bordered boxes with small labels and large numbers -- functional but flat.
**Fix**:
- Make the hero metric value text slightly smaller (text-3xl instead of text-4xl) so it doesn't visually scream
- Add a thin top accent line (2px border-top in foreground color) to each hero card for structure
- Tighten the label-to-value spacing

---

### 3. Dashboard: Funnel stage labels truncate / misalign
**Current**: Stage labels are right-aligned in a fixed `w-28` container. "Contract Sent" and "Proposal Sent" are tight.
**Fix**: Increase label width to `w-32` to prevent any truncation. Add a slight opacity hierarchy -- the bar fill should be more visible (use `bg-foreground/20` instead of `/15`).

---

### 4. Dashboard: Secondary metrics strip is cramped
**Current**: 6 metrics in one horizontal strip with `text-[10px]` labels. On smaller screens, labels get truncated.
**Fix**: Change to a 2-row, 3-column grid instead of a single horizontal strip. This gives each metric breathing room and avoids truncation. Use `text-xs` instead of `text-[10px]` for readability.

---

### 5. Dashboard: Recent Leads not clickable
**Current**: Recent leads list items don't have hover states or onClick handlers -- they're just display rows.
**Fix**: Make each recent lead row clickable (opens LeadDetail modal). Add `cursor-pointer hover:bg-secondary/30` for feedback.

---

### 6. Leads Table: Stage badge needs tighter visual language
**Current**: Stage is shown as a plain text in a bordered span.
**Fix**: Keep the bordered badge but make it slightly more compact (`px-1.5 py-0.5`). No other changes needed -- it's already clean.

---

### 7. Pipeline: Column width too narrow for longer names
**Current**: `min-w-[260px]` columns. Deal cards can feel cramped with long company names.
**Fix**: Increase to `min-w-[280px]` for slightly more breathing room. Also add `snap-x snap-mandatory` to the scroll container and `snap-start` to each column for better scroll UX -- columns snap into position when scrolling.

---

### 8. Pipeline: Header total pipeline value position
**Current**: Pipeline value is right-aligned at the top, disconnected from the board.
**Fix**: Move it inline with the title as a secondary stat. Change to: `Pipeline` (title) followed by `$0 total value` as inline muted text. This frees up the header and feels more integrated.

---

### 9. Pipeline: Empty stage columns waste vertical space
**Current**: Empty columns show "No deals" centered text with `py-8` padding, creating large blank areas.
**Fix**: Reduce to `py-4` and use lighter text. The empty state should be minimal -- just enough to indicate droppability.

---

### 10. Lead Detail Modal: Section spacing and hierarchy
**Current**: Sections use uppercase tracking-wider labels with border-bottom. The content sits close together.
**Fix**: Add slightly more spacing between sections (`space-y-8` instead of `space-y-6`). Make section titles slightly larger for scannability.

---

## Files Changed

### `src/pages/Index.tsx`
- Nav bar: increase height to h-14, bold brand text, switch active tab to underline style

### `src/components/Dashboard.tsx`
- Hero cards: add top accent border, tighten sizing
- Funnel: widen labels to w-32, increase bar opacity
- Secondary metrics: convert to 3-col grid
- Recent leads: add click-to-open lead detail + hover state

### `src/components/Pipeline.tsx`
- Column width: 260px to 280px
- Add scroll snapping (snap-x, snap-start)
- Inline pipeline value with title
- Reduce empty state padding

### `src/components/LeadsTable.tsx`
- No structural changes -- already clean

All changes maintain the hyper-minimal black-and-white aesthetic. No new dependencies. No icons. Pure refinement of spacing, hierarchy, and interaction feedback.

