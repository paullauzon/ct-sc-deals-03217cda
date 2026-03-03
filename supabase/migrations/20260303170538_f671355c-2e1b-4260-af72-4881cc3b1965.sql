
CREATE TABLE public.leads (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT 'Captarget',
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  company_url TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  date_submitted TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  deals_planned TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'New Lead',
  service_interest TEXT NOT NULL DEFAULT 'TBD',
  deal_value NUMERIC NOT NULL DEFAULT 0,
  assigned_to TEXT NOT NULL DEFAULT '',
  meeting_date TEXT NOT NULL DEFAULT '',
  meeting_set_date TEXT NOT NULL DEFAULT '',
  hours_to_meeting_set NUMERIC,
  days_in_current_stage NUMERIC NOT NULL DEFAULT 0,
  stage_entered_date TEXT NOT NULL DEFAULT '',
  close_reason TEXT NOT NULL DEFAULT '',
  closed_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  last_contact_date TEXT NOT NULL DEFAULT '',
  next_follow_up TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Medium',
  meeting_outcome TEXT NOT NULL DEFAULT '',
  forecast_category TEXT NOT NULL DEFAULT '',
  icp_fit TEXT NOT NULL DEFAULT '',
  won_reason TEXT NOT NULL DEFAULT '',
  lost_reason TEXT NOT NULL DEFAULT '',
  subscription_value NUMERIC NOT NULL DEFAULT 0,
  billing_frequency TEXT NOT NULL DEFAULT '',
  contract_start TEXT NOT NULL DEFAULT '',
  contract_end TEXT NOT NULL DEFAULT '',
  target_criteria TEXT NOT NULL DEFAULT '',
  target_revenue TEXT NOT NULL DEFAULT '',
  geography TEXT NOT NULL DEFAULT '',
  current_sourcing TEXT NOT NULL DEFAULT '',
  is_duplicate BOOLEAN NOT NULL DEFAULT false,
  duplicate_of TEXT NOT NULL DEFAULT '',
  hear_about_us TEXT NOT NULL DEFAULT '',
  acquisition_strategy TEXT NOT NULL DEFAULT '',
  buyer_type TEXT NOT NULL DEFAULT '',
  fireflies_url TEXT NOT NULL DEFAULT '',
  fireflies_transcript TEXT NOT NULL DEFAULT '',
  fireflies_summary TEXT NOT NULL DEFAULT '',
  fireflies_next_steps TEXT NOT NULL DEFAULT '',
  -- JSONB columns for complex nested data
  meetings JSONB NOT NULL DEFAULT '[]'::jsonb,
  submissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  enrichment JSONB,
  deal_intelligence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Open RLS policy (no auth in this app)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to leads"
  ON public.leads
  FOR ALL
  USING (true)
  WITH CHECK (true);
