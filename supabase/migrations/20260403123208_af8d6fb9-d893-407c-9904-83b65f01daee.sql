CREATE TABLE public.lead_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  draft_type text NOT NULL DEFAULT '',
  action_key text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  context_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX lead_drafts_lead_action_key ON public.lead_drafts (lead_id, action_key);

ALTER TABLE public.lead_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to lead_drafts"
  ON public.lead_drafts
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);