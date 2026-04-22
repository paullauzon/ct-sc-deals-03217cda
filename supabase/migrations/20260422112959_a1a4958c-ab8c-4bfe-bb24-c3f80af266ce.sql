
-- Audit trail for email-quote → CRM-field linking
CREATE TABLE public.email_field_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  email_id UUID NOT NULL,
  thread_id TEXT NOT NULL DEFAULT '',
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL DEFAULT '',
  previous_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL DEFAULT '',
  source_excerpt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_email_field_links_lead ON public.email_field_links(lead_id, created_at DESC);
CREATE INDEX idx_email_field_links_email ON public.email_field_links(email_id);
CREATE INDEX idx_email_field_links_field ON public.email_field_links(lead_id, field_key);

ALTER TABLE public.email_field_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access email_field_links"
ON public.email_field_links
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
