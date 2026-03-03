

# Fix: All Leads Sharing Barry's Transcript

## Root Cause

In `src/contexts/LeadContext.tsx`, the migration loop (line 48-51) assigns default values from `LEAD_DEFAULTS` by reference:

```js
if ((migrated as any)[key] === undefined) {
  (migrated as any)[key] = defaultVal; // same [] for every lead
}
```

`LEAD_DEFAULTS.meetings` is a single `[]` instance. Every lead without meetings gets that **same array reference**. When Barry's transcript migration does `.push()` on line 64, it mutates the shared array — so all leads end up with Barry's meeting.

## Fix

**`src/contexts/LeadContext.tsx`** — In the migration default-assignment loop, deep-clone array/object defaults instead of assigning by reference:

```js
(migrated as any)[key] = Array.isArray(defaultVal) 
  ? [...defaultVal] 
  : (typeof defaultVal === 'object' && defaultVal !== null) 
    ? { ...defaultVal } 
    : defaultVal;
```

This ensures each lead gets its own independent `meetings` array.

| File | Change |
|------|--------|
| `src/contexts/LeadContext.tsx` | Clone array/object defaults in migration loop (line ~50) |

