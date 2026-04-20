CREATE TABLE public.email_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL,
  email_address TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'incremental',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  unmatched INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sync_runs_connection_started
  ON public.email_sync_runs (connection_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_emails_unmatched
  ON public.lead_emails (lead_id, email_date DESC)
  WHERE lead_id = 'unmatched';

ALTER TABLE public.email_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to email_sync_runs"
  ON public.email_sync_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);