CREATE TABLE public.pipeline_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  stage_data jsonb NOT NULL DEFAULT '{}',
  total_pipeline_value numeric NOT NULL DEFAULT 0,
  weighted_pipeline_value numeric NOT NULL DEFAULT 0,
  deal_count integer NOT NULL DEFAULT 0,
  new_deals integer NOT NULL DEFAULT 0,
  deals_advanced integer NOT NULL DEFAULT 0,
  deals_lost integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to pipeline_snapshots"
  ON public.pipeline_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_pipeline_snapshots_date ON public.pipeline_snapshots (snapshot_date DESC);