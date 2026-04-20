-- Fireflies retry queue
CREATE TABLE IF NOT EXISTS public.fireflies_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | gave_up
  last_error TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fireflies_id)
);

CREATE INDEX IF NOT EXISTS idx_fireflies_retry_due
  ON public.fireflies_retry_queue (status, next_attempt_at);

ALTER TABLE public.fireflies_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access fireflies_retry_queue"
  ON public.fireflies_retry_queue FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Cron run log
CREATE TABLE IF NOT EXISTS public.cron_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success', -- success | error
  items_processed INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT DEFAULT '',
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_run_log_job_time
  ON public.cron_run_log (job_name, ran_at DESC);

ALTER TABLE public.cron_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can view cron_run_log"
  ON public.cron_run_log FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role can insert cron_run_log"
  ON public.cron_run_log FOR INSERT TO authenticated
  WITH CHECK (true);
