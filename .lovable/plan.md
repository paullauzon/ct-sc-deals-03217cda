
## Audit summary — what's left from v5

**Shipped & verified working (v5 round):**
- Activity timeline: search, date range, expand/collapse all, pin-to-top
- Acquirer Profile card (SourceCo)
- Inline Fireflies transcript drawer
- Upcoming meeting reads `calendly_booked_at` + Calendly link only when valid URL
- Email open/click/replied chips from `lead_email_metrics`
- Always-visible status chip in header
- Refreshed keyboard cheatsheet
- Density toggle (`D`) + rail toggles (`[` / `]`) with localStorage

**Still NOT shipped from the v5 plan (these 4 items):**
1. **Tab overflow** — 8 tabs already overflow at narrow panel widths, no horizontal scroll, no "More" menu
2. **Notes edit/delete** — `LeadNotesTab` is read-only per entry; can only append via NoteDialog
3. **Stakeholder remove confirm** — still uses `window.confirm()` which breaks the design language (we removed all other native prompts)
4. **Realtime lead-row subscription** — only `lead_emails` is subscribed; stage/value/status changes from other tabs or processing jobs don't reflect live in the open panel

## Fix plan (single round)

### 1. Tab overflow — horizontal scroll + edge fade
Simplest, most premium pattern: make `TabsList` horizontally scrollable with an overflow gradient on the right edge. No "More" dropdown needed (it adds chrome). Tabs already have icons + labels; horizontal scroll is the HubSpot pattern at this density.

- `LeadDetailPanel.tsx` lines 306-337: wrap `TabsList` in a relatively-positioned div with `overflow-x-auto scrollbar-hide` and a right-side gradient overlay that fades when scrolled to end.

### 2. Notes edit & delete
Notes are stored as a single concatenated `lead.notes` string with `--- date · author ---` separators. Need to:
- Parse entries (already done in `parseNotes`)
- Add hover-revealed Edit/Delete actions per entry
- Edit opens an inline textarea (saves by re-serializing all entries back to the string)
- Delete shows AlertDialog confirm, then re-serializes without that entry
- Both write to activity log

Files: `LeadNotesTab.tsx` rewrite, no schema change.

### 3. Stakeholder remove → AlertDialog
Replace `window.confirm` in `StakeholderCard.tsx` line 71-72 with an `AlertDialog` controlled by local state. Match the same pattern used in `LeadPanelHeader` for stage regression.

### 4. Realtime lead-row subscription
Subscribe to `postgres_changes` on the `leads` table filtered by the active lead id. On UPDATE, invoke `useLeads().refresh()` (or update the local context cache) so stage/value/status flip live.

- `LeadDetailPanel.tsx` after the email channel useEffect: add a second channel for `lead_id=eq.${activeLeadId}` on `leads` table.
- Need to verify the `LeadContext` exposes a `refresh` or `setLead` method; if not, add one. Most lightweight: re-fetch just that single lead row and merge into context.

## Files touched (4)
- `src/components/LeadDetailPanel.tsx` — tab overflow scroll wrapper + realtime lead subscription
- `src/components/lead-panel/LeadNotesTab.tsx` — full rewrite with edit/delete per entry
- `src/components/lead-panel/cards/StakeholderCard.tsx` — replace window.confirm with AlertDialog
- `src/contexts/LeadContext.tsx` — verify/add a lightweight single-lead refresh method (only if not already present)

## Risk
- All four items are isolated, additive changes
- No schema migrations needed
- Realtime subscription cleanup pattern already proven by the email channel
- Notes edit/delete keeps the existing serialized format so old data is preserved
