CREATE TABLE public.lead_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  event_type text NOT NULL DEFAULT 'field_update',
  description text NOT NULL DEFAULT '',
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to lead_activity_log"
  ON public.lead_activity_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_lead_activity_log_lead_id ON public.lead_activity_log (lead_id);
CREATE INDEX idx_lead_activity_log_created_at ON public.lead_activity_log (created_at DESC);