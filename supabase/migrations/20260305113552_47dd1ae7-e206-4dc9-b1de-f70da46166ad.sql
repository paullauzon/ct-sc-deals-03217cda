
CREATE TABLE public.lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  message_id text UNIQUE,
  thread_id text DEFAULT '',
  direction text NOT NULL DEFAULT 'inbound',
  from_address text NOT NULL,
  from_name text DEFAULT '',
  to_addresses text[] DEFAULT '{}',
  subject text DEFAULT '',
  body_preview text DEFAULT '',
  email_date timestamptz NOT NULL DEFAULT now(),
  source text DEFAULT 'zapier',
  raw_payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lead_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to lead_emails" ON public.lead_emails FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_lead_emails_lead_id ON public.lead_emails(lead_id);
CREATE INDEX idx_lead_emails_email_date ON public.lead_emails(email_date DESC);
CREATE INDEX idx_lead_emails_thread_id ON public.lead_emails(thread_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_emails;
