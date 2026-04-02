

# System Switcher: Separate Sales CRM from Business Operations

## What Changes

The CAPTARGET logo in the nav becomes a system switcher. Clicking it opens a dropdown with two options:
- **Sales CRM** (current system: Dashboard, Pipeline, Leads, Command)
- **Business Operations** (new system: the Business metrics dashboard, expanded to full-page)

Each system has its own nav bar and views. They share the same data (LeadContext) but are completely independent UIs.

## Architecture

### 1. System state in Index.tsx

Add a `system` state: `"crm" | "business"`. Persist in hash as `sys=crm` or `sys=business`. The CAPTARGET logo gets an onClick that toggles a small popover/dropdown with the two system options.

### 2. Logo Switcher Component

A small `SystemSwitcher` component rendered where the logo currently is. Shows "CAPTARGET" text. On click, shows a dropdown with two rows:
- **Sales CRM** with a brief descriptor, highlighted if active
- **Business Ops** with a brief descriptor, highlighted if active

Clicking switches the `system` state. Clean, minimal UI (similar to Notion workspace switcher or Linear team switcher).

### 3. CRM System (existing)

When `system === "crm"`: render the current nav (Dashboard, Pipeline, Leads, Command) and current views. No changes to existing functionality.

### 4. Business System (new)

When `system === "business"`: render a different nav bar with its own tabs. The `DashboardBusiness` component gets promoted from a Dashboard sub-tab to the main content of this system. The Business system nav will have tabs for the sections we're building across responses 2-4:
- **Overview** (Brand Scorecards + Source Funnels, already built)
- **Economics** (Unit Economics, response 2)
- **Operations** (Capacity + Pipeline Health, response 3)
- **Forecast** (Revenue projections, response 4)

For now (this response), only Overview exists. The other tabs will be placeholder/coming-soon until built.

### 5. Remove "Business" tab from Dashboard.tsx

Since Business is now its own system, remove it from the `TABS` array and the `DashboardTab` type in Dashboard.tsx.

## Files Changed

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Add `system` state with hash persistence. Replace logo `<span>` with `SystemSwitcher`. Conditionally render CRM views or Business system based on `system` state. |
| `src/components/SystemSwitcher.tsx` | New component: dropdown on the CAPTARGET logo with two system options (Sales CRM, Business Ops). Uses Popover from shadcn. |
| `src/components/BusinessSystem.tsx` | New component: full-page layout for Business Operations with its own nav tabs (Overview, Economics, Operations, Forecast). Renders `DashboardBusiness` for Overview, placeholder cards for the rest. |
| `src/components/Dashboard.tsx` | Remove "business" from `TABS` array and `DashboardTab` type. Remove `DashboardBusiness` import and rendering. |

