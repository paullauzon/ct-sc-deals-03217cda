
-- Phase 8: Intelligence notes (preserved snippets pushed from email threads)
CREATE TABLE IF NOT EXISTS public.lead_intelligence_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  source text NOT NULL DEFAULT 'email_thread',
  source_ref text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  signal_tags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_intelligence_notes_lead_idx ON public.lead_intelligence_notes(lead_id, created_at DESC);

ALTER TABLE public.lead_intelligence_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access lead_intelligence_notes"
  ON public.lead_intelligence_notes FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Phase 8: Mailbox-level user preferences (tracking on/off per mailbox)
CREATE TABLE IF NOT EXISTS public.mailbox_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  tracking_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id)
);

ALTER TABLE public.mailbox_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access mailbox_preferences"
  ON public.mailbox_preferences FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Phase 8: Storage bucket for email attachments uploaded from compose
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'email-attachments');

CREATE POLICY "Authenticated can read attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'email-attachments');

CREATE POLICY "Public can read attachments"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'email-attachments');
