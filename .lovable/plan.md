

# Replace Brand Text Badges with Company Logos

## What Changes
Replace all the monochrome "CT" / "SC" text badges throughout the app with small logo images from each company's website. This gives instant visual brand recognition at a glance.

## Logo Sources
- **Captarget**: The red "CAPTARGET" wordmark from captarget.com's navbar (`https://cdn.prod.website-files.com/...` — Webflow CDN)
- **SourceCo**: The gold flower icon from sourcecodeals.com's navbar

We'll download both logos and save them as static assets in `public/` to avoid external CDN dependency and ensure they always load.

## Implementation

### 1. Add logo assets
- Save Captarget logo as `public/captarget-logo.svg` (or PNG)
- Save SourceCo logo as `public/sourceco-logo.svg` (or PNG)
- Extract these from the respective websites' navbar images

### 2. Create `BrandLogo` component (`src/components/BrandLogo.tsx`)
A small reusable component that renders the appropriate logo image based on brand:

```tsx
function BrandLogo({ brand, size = "sm" }: { brand: string; size?: "xs" | "sm" | "md" }) {
  const src = brand === "Captarget" ? "/captarget-logo.png" : "/sourceco-logo.png";
  const dims = { xs: "h-3", sm: "h-3.5", md: "h-4" };
  return <img src={src} alt={brand} className={`${dims[size]} object-contain`} />;
}
```

### 3. Replace all brand badge instances
Swap every `<span>...CT/SC...</span>` pattern with `<BrandLogo brand={lead.brand} />` across these files:

| File | Locations |
|------|-----------|
| `src/components/Pipeline.tsx` | Pipeline card (line 326) |
| `src/components/LeadsTable.tsx` | Table row (line 1202), side panel header (line 221), submission history (line 911) |
| `src/components/Dashboard.tsx` | Leaderboard rows (lines 672, 1027), company sources (line 167) |
| `src/components/ActionQueue.tsx` | Action item (line 238) |
| `src/components/MeetingsSection.tsx` | Meeting brand badge (line 731) |
| `src/components/FirefliesImport.tsx` | Meeting assignment (line 250), lead select options (line 305) |
| `src/pages/DealRoom.tsx` | Deal room header (line 97) |

The text-only references in `LeadContext.tsx` (toast descriptions) stay as "CT"/"SC" text since those are notification strings, not visual badges.

## Files Changed
| File | Change |
|------|--------|
| `public/captarget-logo.png` | New — Captarget logo asset |
| `public/sourceco-logo.png` | New — SourceCo logo asset |
| `src/components/BrandLogo.tsx` | New — reusable logo component |
| `src/components/Pipeline.tsx` | Replace text badge with `<BrandLogo>` |
| `src/components/LeadsTable.tsx` | Replace 3 text badges with `<BrandLogo>` |
| `src/components/Dashboard.tsx` | Replace 2 text badges with `<BrandLogo>` |
| `src/components/ActionQueue.tsx` | Replace text badge with `<BrandLogo>` |
| `src/components/MeetingsSection.tsx` | Replace text badge with `<BrandLogo>` |
| `src/components/FirefliesImport.tsx` | Replace 2 text badges with `<BrandLogo>` |
| `src/pages/DealRoom.tsx` | Replace text badge with `<BrandLogo>` |

