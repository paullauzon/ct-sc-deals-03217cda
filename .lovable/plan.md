

# Fetch & Display Company Logos for All Leads

## Overview

Add a `company_logo_url` field to leads, fetch logos automatically using Firecrawl's branding scrape when leads come in, and display them as small avatars next to the company name throughout the UI.

## How Logo Fetching Works

Use the **Google favicon API** as the primary source — it's free, instant, and doesn't consume Firecrawl credits. For any lead with a `company_url` or an email domain, construct:

```
https://www.google.com/s2/favicons?domain=example.com&sz=64
```

This returns a 64px icon for virtually any domain. No edge function needed for fetching — we store the URL pattern and resolve it client-side. For leads without a domain, show a letter avatar fallback (first letter of company name).

This approach is:
- **Free** — no API credits consumed
- **Instant** — no async processing or edge function calls
- **Universal** — works for 95%+ of domains
- **No migration needed** — computed from existing `companyUrl` or `email` fields

## What Gets Built

### 1. New utility: `src/lib/companyLogo.ts`

A pure function that takes a lead and returns a logo URL:
- If `companyUrl` exists → extract domain → Google favicon URL
- Else if `email` exists and domain isn't generic (gmail, yahoo, etc.) → use email domain
- Else → return `null` (component will show letter fallback)

### 2. New component: `src/components/CompanyAvatar.tsx`

A reusable avatar component:
- Renders a 20x20 (or configurable size) rounded square with the favicon
- On image error → falls back to a letter avatar (first letter of company, `bg-secondary text-muted-foreground`)
- Sizes: `xs` (16px), `sm` (20px), `md` (24px), `lg` (32px)

### 3. Pipeline cards (`Pipeline.tsx`)

Replace the company text line (Row 1, line 340) from:
```
{lead.company || "—"} · {lead.role}
```
to:
```
<CompanyAvatar lead={lead} size="xs" />  {lead.company || "—"} · {lead.role}
```

The company logo sits inline before the company name on Row 2.

### 4. Leads table (`LeadsTable.tsx`)

Add `CompanyAvatar` inline next to the company name in the table row and in the lead detail sheet header.

### 5. Deal Room (`DealRoom.tsx`)

Add `CompanyAvatar` (size `md`) in the deal header next to the lead name/company info.

### 6. Command Center tabs

Any place that shows a lead name with company — add the avatar inline.

## Design

- Rounded square corners (`rounded-sm`), not circular — differentiates from owner avatars
- Monochrome letter fallback matches the premium aesthetic (`bg-secondary text-muted-foreground`)
- No colored borders or decorations
- Subtle `ring-1 ring-border` to define the edge when logos have white backgrounds

## Files Changed

| File | Changes |
|------|---------|
| `src/lib/companyLogo.ts` | New utility — `getCompanyLogoUrl(lead)` returns favicon URL or null |
| `src/components/CompanyAvatar.tsx` | New component — renders logo with letter fallback |
| `src/components/Pipeline.tsx` | Add `CompanyAvatar` on Row 2 next to company name |
| `src/components/LeadsTable.tsx` | Add `CompanyAvatar` in table rows and detail sheet |
| `src/pages/DealRoom.tsx` | Add `CompanyAvatar` in deal header |

No database migration needed. No edge function needed. Pure client-side derivation from existing data.

