

# Email Correspondence Integration via Zapier

## Overview
Add email tracking per lead by creating a `lead_emails` table, an `ingest-email` edge function (webhook endpoint for Zapier), and a new "Emails" tab in the lead detail panel alongside the existing Meetings section.

## Zapier Setup (User Side)
1. Create a Zap: **"New Email in Gmail/Outlook → Webhooks by Zapier (POST)"**
2. Filter: Only forward emails matching lead domains/addresses
3. POST to: `https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/ingest-email`
4. Auth: Bearer token using the existing `INGEST_API_KEY`
5. Payload maps: from, to, subject, body_preview, date, thread_id, message_id

## Technical Implementation

### 1. New `lead_emails` table
```sql
CREATE TABLE lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  message_id text UNIQUE,
  thread_id text DEFAULT '',
  direction text NOT NULL DEFAULT 'inbound',  -- 'inbound' | 'outbound'
  from_address text NOT NULL,
  from_name text DEFAULT '',
  to_addresses text[] DEFAULT '{}',
  subject text DEFAULT '',
  body_preview text DEFAULT '',
  email_date timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'zapier',  -- 'zapier' | 'manual'
  raw_payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```
- RLS: open (matches existing `leads` table pattern)
- Enable realtime for live updates

### 2. `ingest-email` Edge Function
- Accepts POST with Bearer `INGEST_API_KEY` auth (same pattern as `ingest-lead`)
- Receives: `from`, `to`, `subject`, `body_preview`, `date`, `thread_id`, `message_id`
- **Lead matching**: looks up `leads` table by email address (checks both `from` and `to` against lead emails)
- **Direction detection**: if sender matches internal domains (`captarget.com`, `sourcecodeals.com`) → `outbound`, otherwise → `inbound`
- Inserts into `lead_emails` with matched `lead_id`
- Deduplication via `message_id` UNIQUE constraint
- If no lead match found, stores with `lead_id = 'unmatched'` for later review

### 3. UI: "Emails" Tab in Lead Detail
- Add an "Emails" tab next to the existing "Meetings" tab in `MeetingsSection.tsx`
- Fetch emails from `lead_emails` where `lead_id` matches, ordered by `email_date` desc
- Each email shows: direction badge (↗ Sent / ↙ Received), subject, from/to, date, body preview
- Thread grouping by `thread_id` (collapsible)
- Email count badge on the tab header
- Realtime subscription for new emails appearing live

### 4. LeadContext Integration
- Add `emailCount` to lead display (optional badge in leads table)
- No need to store emails in the lead JSONB — separate table is cleaner and more scalable

## Files to Create/Modify
- **Create**: `supabase/functions/ingest-email/index.ts`
- **Create**: `src/components/EmailsSection.tsx`
- **Modify**: `src/components/MeetingsSection.tsx` or parent component — add Emails tab
- **Modify**: `supabase/config.toml` — add `[functions.ingest-email]` with `verify_jwt = false`
- **Migration**: Create `lead_emails` table + realtime

