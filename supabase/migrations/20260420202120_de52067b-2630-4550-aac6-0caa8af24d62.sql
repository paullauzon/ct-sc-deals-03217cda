-- Email backfill orchestrator: resumable, two-phase pipeline
CREATE TABLE IF NOT EXISTS public.email_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  email_address text NOT NULL,
  provider text NOT NULL,
  target_window text NOT NULL DEFAULT '90d', -- '90d' | '1y' | '3y' | 'all'
  status text NOT NULL DEFAULT 'queued',     -- queued | discovering | running | paused | done | failed | cancelled
  discovery_cursor text,                     -- gmail pageToken / outlook @odata.nextLink for inbox
  discovery_cursor_sent text,                -- outlook @odata.nextLink for SentItems
  discovery_complete boolean NOT NULL DEFAULT false,
  estimated_total integer NOT NULL DEFAULT 0,
  messages_discovered integer NOT NULL DEFAULT 0,
  messages_processed integer NOT NULL DEFAULT 0,
  messages_inserted integer NOT NULL DEFAULT 0,
  messages_matched integer NOT NULL DEFAULT 0,
  messages_unmatched integer NOT NULL DEFAULT 0,
  messages_skipped integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  last_chunked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON public.email_backfill_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_connection ON public.email_backfill_jobs(connection_id);

ALTER TABLE public.email_backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access email_backfill_jobs"
  ON public.email_backfill_jobs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.email_backfill_queue (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.email_backfill_jobs(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  provider_message_id text NOT NULL,
  folder text NOT NULL DEFAULT 'inbox',  -- inbox | sent
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',  -- pending | done | skipped | error
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_backfill_queue_conn_msg
  ON public.email_backfill_queue(connection_id, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_backfill_queue_pending
  ON public.email_backfill_queue(job_id, status) WHERE status = 'pending';

ALTER TABLE public.email_backfill_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access email_backfill_queue"
  ON public.email_backfill_queue FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_email_backfill_jobs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_email_backfill_jobs ON public.email_backfill_jobs;
CREATE TRIGGER trg_touch_email_backfill_jobs
  BEFORE UPDATE ON public.email_backfill_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_backfill_jobs();

-- Idempotency on lead_emails ingestion (so concurrent hydrate workers can't dup)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_emails_provider_message
  ON public.lead_emails(provider_message_id) WHERE provider_message_id IS NOT NULL;