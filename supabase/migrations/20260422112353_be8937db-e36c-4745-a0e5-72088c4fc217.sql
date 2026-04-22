
CREATE TABLE IF NOT EXISTS public.email_thread_intelligence (
  thread_id text PRIMARY KEY,
  lead_id text NOT NULL,
  summary text NOT NULL DEFAULT '',
  sentiment text NOT NULL DEFAULT 'neutral',
  recommended_action text NOT NULL DEFAULT '',
  recommended_subject text NOT NULL DEFAULT '',
  recommended_body text NOT NULL DEFAULT '',
  suggested_sequence_step text NOT NULL DEFAULT '',
  hot_flag boolean NOT NULL DEFAULT false,
  signal_tags text[] NOT NULL DEFAULT '{}',
  email_count integer NOT NULL DEFAULT 0,
  last_email_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL DEFAULT 'google/gemini-3-flash-preview'
);

CREATE INDEX IF NOT EXISTS email_thread_intelligence_lead_id_idx ON public.email_thread_intelligence(lead_id);
CREATE INDEX IF NOT EXISTS email_thread_intelligence_generated_at_idx ON public.email_thread_intelligence(generated_at DESC);

ALTER TABLE public.email_thread_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access email_thread_intelligence"
  ON public.email_thread_intelligence FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.email_thread_intelligence;
