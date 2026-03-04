

# New Lead Notification System

## What it does
When leads arrive via Zapier/Webflow, the app will detect them in real-time and surface them visibly so you never miss an incoming lead.

## Three components

### 1. Real-time subscription on the `leads` table
- Enable Supabase realtime on the `leads` table (`ALTER PUBLICATION supabase_realtime ADD TABLE public.leads`)
- In `LeadContext`, subscribe to `INSERT` events on the `leads` table
- When a new row arrives that isn't already in local state, add it to the leads array and trigger a toast notification

### 2. Toast notification on new lead arrival
- When a new lead is detected via realtime, show a sonner toast:
  **"New lead: John Smith from Acme Corp"** with brand badge (CT/SC) and source label
- Clicking the toast navigates to the Leads view and opens that lead's detail panel

### 3. "New" badge on recently ingested leads
- Add a `isNew` computed property: leads created within the last 24 hours (based on `created_at`) that are still in "New Lead" stage get a pulsing green "NEW" badge
- Show this badge in the LeadsTable rows and on Pipeline deal cards
- Badge disappears once the lead is moved out of "New Lead" stage or after 24 hours

### 4. Nav bar indicator
- Show a small count badge on the "Leads" nav tab when there are unseen new leads (leads inserted since the user last viewed the Leads tab)
- Clear the count when the user switches to the Leads view

## Files changed
- **Migration**: Enable realtime on `leads` table
- **`src/contexts/LeadContext.tsx`**: Add realtime subscription for `INSERT` events, toast on new lead, track "unseen" count
- **`src/pages/Index.tsx`**: Pass unseen count to nav, clear on tab switch
- **`src/components/LeadsTable.tsx`**: Add "NEW" badge to table rows for recent leads
- **`src/components/Pipeline.tsx`**: Add "NEW" badge to pipeline cards for recent leads

