-- Reclaim jobs table — tracks resumable backlog reclamation
CREATE TABLE IF NOT EXISTS public.reclaim_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed' | 'cancelled'
  cursor TIMESTAMPTZ,
  total_scanned INTEGER NOT NULL DEFAULT 0,
  total_reclassified INTEGER NOT NULL DEFAULT 0,
  total_remaining INTEGER NOT NULL DEFAULT 0,
  thread_claimed INTEGER NOT NULL DEFAULT 0,
  forward_claimed INTEGER NOT NULL DEFAULT 0,
  cc_claimed INTEGER NOT NULL DEFAULT 0,
  internal_claimed INTEGER NOT NULL DEFAULT 0,
  outbound_claimed INTEGER NOT NULL DEFAULT 0,
  noise_routed INTEGER NOT NULL DEFAULT 0,
  firm_unrelated_routed INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_tick_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

ALTER TABLE public.reclaim_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access reclaim_jobs"
  ON public.reclaim_jobs FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_reclaim_jobs_status ON public.reclaim_jobs (status, started_at DESC);

-- Auto-quarantine trigger: flips email_quarantined to true on bounce thresholds
CREATE OR REPLACE FUNCTION public.auto_quarantine_on_bounce()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 2+ hard bounces in 30 days OR 3+ lifetime bounces => quarantine
  IF NEW.total_bounces >= 2
     AND NEW.last_bounce_date IS NOT NULL
     AND NEW.last_bounce_date > (now() - INTERVAL '30 days')
     AND COALESCE(NEW.email_quarantined, false) = false THEN
    NEW.email_quarantined := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_quarantine_on_bounce ON public.lead_email_metrics;
CREATE TRIGGER trg_auto_quarantine_on_bounce
  BEFORE INSERT OR UPDATE OF total_bounces, last_bounce_date ON public.lead_email_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_quarantine_on_bounce();
