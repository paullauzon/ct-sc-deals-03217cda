

# Tag Meetings with Source Brand + Filter in Import Dialog

## Changes

### 1. Add `sourceBrand` to Meeting type (`src/types/lead.ts`)
Add optional `sourceBrand?: Brand` field to the `Meeting` interface (line 70).

### 2. Add `sourceBrand` to FirefliesMeeting and tag on fetch (`src/components/FirefliesImport.tsx`)
- Add `sourceBrand: Brand` to the `FirefliesMeeting` interface
- After fetching CT and SC meetings separately (lines 73-74), tag each array before merging:
  ```
  ctMeetings.forEach(m => m.sourceBrand = "Captarget")
  scMeetings.forEach(m => m.sourceBrand = "SourceCo")
  ```
- In `handleImport`, persist `sourceBrand` onto the `Meeting` object when creating it (line 127+)

### 3. Show CT/SC badge on each meeting row in import dialog (`FirefliesImport.tsx` → `MeetingCard`)
Add a small badge next to the meeting title:
```
<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary">
  {meeting.sourceBrand === "Captarget" ? "CT" : "SC"}
</span>
```

### 4. Filter lead dropdown by matching brand (`FirefliesImport.tsx` → `MeetingCard`)
In the assign-to `Select`, filter leads to only show those matching the meeting's `sourceBrand`. Keep a "Show all leads" option or similar so the user can override if needed. Simplest: sort matching-brand leads first, separate with a visual divider.

### 5. Auto-match should prefer same-brand leads (`FirefliesImport.tsx` → `autoMatchLead`)
Update `autoMatchLead` to prioritize leads whose `brand` matches the meeting's `sourceBrand`. If no same-brand match, fall back to cross-brand.

### 6. Show brand badge on meeting cards in lead detail (`src/components/MeetingsSection.tsx`)
In `MeetingCard`, if `meeting.sourceBrand` exists, show a small CT/SC indicator next to the title (line 173).

| File | Change |
|------|--------|
| `src/types/lead.ts` | Add `sourceBrand?: Brand` to `Meeting` |
| `src/components/FirefliesImport.tsx` | Tag meetings with brand, show badge, filter/sort leads by brand, prefer same-brand in auto-match |
| `src/components/MeetingsSection.tsx` | Show CT/SC badge on meeting cards if `sourceBrand` is set |

