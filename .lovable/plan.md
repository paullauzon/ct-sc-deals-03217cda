

# Dual Fireflies API Keys (Captarget + SourceCo)

## Problem
Captarget and SourceCo use separate Fireflies.ai accounts, each with its own API key. Currently the edge function reads a single `FIREFLIES_API_KEY` secret.

## Solution
Add a second secret `FIREFLIES_API_KEY_SOURCECO` and pass a `brand` parameter from the frontend so the edge function picks the correct key.

### Changes

**1. Add new secret**
- Use `add_secret` to request `FIREFLIES_API_KEY_SOURCECO` from the user

**2. Edge function: `fetch-fireflies/index.ts`**
- Accept a `brand` field in the request body (`"Captarget"` | `"SourceCo"`)
- Select API key: `brand === "SourceCo" ? FIREFLIES_API_KEY_SOURCECO : FIREFLIES_API_KEY`
- Error if the selected key is missing

**3. `MeetingsSection.tsx` — Auto-find button**
- Pass `brand: lead.brand` in the `fetch-fireflies` invocation body

**4. `FirefliesImport.tsx` — Bulk import**
- Add a brand selector (or fetch from both accounts)
- Pass `brand` to the edge function call
- Option: add a "Fetch from both accounts" toggle that makes two sequential calls and merges results

**5. `LeadsTable.tsx`** (if it calls fetch-fireflies directly)
- Pass `brand` through to any Fireflies calls

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/fetch-fireflies/index.ts` | Read `brand` from body, select correct API key |
| `src/components/MeetingsSection.tsx` | Pass `brand: lead.brand` to fetch-fireflies |
| `src/components/FirefliesImport.tsx` | Add brand selector or dual-fetch, pass brand |
| New secret: `FIREFLIES_API_KEY_SOURCECO` | SourceCo Fireflies API key |

