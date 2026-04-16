ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS secondary_contacts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS google_drive_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS forecasted_close_date text NOT NULL DEFAULT '';