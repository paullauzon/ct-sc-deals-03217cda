CREATE TABLE public.business_cost_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  month text NOT NULL,
  sales_cost numeric NOT NULL DEFAULT 0,
  tool_cost numeric NOT NULL DEFAULT 0,
  ad_spend numeric NOT NULL DEFAULT 0,
  margin_pct jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand, month)
);

ALTER TABLE public.business_cost_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to business_cost_inputs"
  ON public.business_cost_inputs
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);