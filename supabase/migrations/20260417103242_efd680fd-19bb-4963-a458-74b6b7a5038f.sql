
-- v4: lead status, mutual close plan, deal economics, narrative, pinned activity, stakeholders table

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'Working',
  ADD COLUMN IF NOT EXISTS next_mutual_step text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_mutual_step_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS competing_bankers text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contract_months integer,
  ADD COLUMN IF NOT EXISTS close_confidence integer,
  ADD COLUMN IF NOT EXISTS deal_narrative text NOT NULL DEFAULT '';

ALTER TABLE public.lead_activity_log
  ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.lead_stakeholders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  linkedin_url text NOT NULL DEFAULT '',
  sentiment text NOT NULL DEFAULT 'neutral',
  last_contacted timestamp with time zone,
  notes text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_stakeholders_lead_id ON public.lead_stakeholders(lead_id);

ALTER TABLE public.lead_stakeholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to lead_stakeholders" ON public.lead_stakeholders;
CREATE POLICY "Allow all access to lead_stakeholders"
  ON public.lead_stakeholders FOR ALL
  USING (true)
  WITH CHECK (true);
