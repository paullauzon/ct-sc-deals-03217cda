
CREATE TABLE public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  lead_name text NOT NULL,
  job_type text NOT NULL DEFAULT 'individual',
  status text NOT NULL DEFAULT 'queued',
  lead_data jsonb NOT NULL DEFAULT '{}',
  new_meetings jsonb DEFAULT '[]',
  applied_updates jsonb DEFAULT '{}',
  applied_fields jsonb DEFAULT '[]',
  pending_suggestions jsonb DEFAULT '[]',
  deal_intelligence jsonb,
  error text,
  progress_message text,
  acknowledged boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.processing_jobs;
