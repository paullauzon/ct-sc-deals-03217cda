
-- Phase 1: Email correspondence schema upgrade

-- Extend lead_emails with full body content, tracking, and recipient details
ALTER TABLE public.lead_emails
  ADD COLUMN IF NOT EXISTS body_html TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS body_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cc_addresses TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bcc_addresses TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS opens JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clicks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tracked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS logged BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lead_emails_thread ON public.lead_emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_lead_emails_provider_msg ON public.lead_emails(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_lead_emails_lead_date ON public.lead_emails(lead_id, email_date DESC);

-- Per-lead rollup metrics (HubSpot-style)
CREATE TABLE IF NOT EXISTS public.lead_email_metrics (
  lead_id TEXT PRIMARY KEY,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_opens INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  total_bounces INTEGER NOT NULL DEFAULT 0,
  total_replies INTEGER NOT NULL DEFAULT 0,
  last_sent_date TIMESTAMPTZ,
  last_received_date TIMESTAMPTZ,
  last_opened_date TIMESTAMPTZ,
  last_clicked_date TIMESTAMPTZ,
  last_replied_date TIMESTAMPTZ,
  last_bounce_date TIMESTAMPTZ,
  email_quarantined BOOLEAN NOT NULL DEFAULT false,
  unsubscribed_all BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_email_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to lead_email_metrics"
  ON public.lead_email_metrics FOR ALL USING (true) WITH CHECK (true);

-- Per-user inbox connections (for Gmail OAuth + future per-user Outlook)
CREATE TABLE IF NOT EXISTS public.user_email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_label TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail','outlook')),
  email_address TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  history_id TEXT,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, email_address)
);

ALTER TABLE public.user_email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to user_email_connections"
  ON public.user_email_connections FOR ALL USING (true) WITH CHECK (true);

-- Trigger: maintain rollup metrics on email insert
CREATE OR REPLACE FUNCTION public.update_lead_email_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  open_count INTEGER := COALESCE(jsonb_array_length(NEW.opens), 0);
  click_count INTEGER := COALESCE(jsonb_array_length(NEW.clicks), 0);
  is_bounce BOOLEAN := COALESCE(NEW.bounce_reason, '') <> '';
  is_reply BOOLEAN := NEW.replied_at IS NOT NULL;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.lead_id = 'unmatched' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lead_email_metrics (
    lead_id, total_sent, total_received, total_opens, total_clicks, total_bounces, total_replies,
    last_sent_date, last_received_date, last_opened_date, last_clicked_date, last_replied_date, last_bounce_date,
    updated_at
  ) VALUES (
    NEW.lead_id,
    CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
    CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
    open_count, click_count,
    CASE WHEN is_bounce THEN 1 ELSE 0 END,
    CASE WHEN is_reply THEN 1 ELSE 0 END,
    CASE WHEN NEW.direction = 'outbound' THEN NEW.email_date END,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.email_date END,
    CASE WHEN open_count > 0 THEN NEW.email_date END,
    CASE WHEN click_count > 0 THEN NEW.email_date END,
    NEW.replied_at,
    CASE WHEN is_bounce THEN NEW.email_date END,
    now()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    total_sent       = lead_email_metrics.total_sent + EXCLUDED.total_sent,
    total_received   = lead_email_metrics.total_received + EXCLUDED.total_received,
    total_opens      = lead_email_metrics.total_opens + EXCLUDED.total_opens,
    total_clicks     = lead_email_metrics.total_clicks + EXCLUDED.total_clicks,
    total_bounces    = lead_email_metrics.total_bounces + EXCLUDED.total_bounces,
    total_replies    = lead_email_metrics.total_replies + EXCLUDED.total_replies,
    last_sent_date     = GREATEST(lead_email_metrics.last_sent_date, EXCLUDED.last_sent_date),
    last_received_date = GREATEST(lead_email_metrics.last_received_date, EXCLUDED.last_received_date),
    last_opened_date   = GREATEST(lead_email_metrics.last_opened_date, EXCLUDED.last_opened_date),
    last_clicked_date  = GREATEST(lead_email_metrics.last_clicked_date, EXCLUDED.last_clicked_date),
    last_replied_date  = GREATEST(lead_email_metrics.last_replied_date, EXCLUDED.last_replied_date),
    last_bounce_date   = GREATEST(lead_email_metrics.last_bounce_date, EXCLUDED.last_bounce_date),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_lead_email_metrics ON public.lead_emails;
CREATE TRIGGER trg_update_lead_email_metrics
AFTER INSERT ON public.lead_emails
FOR EACH ROW EXECUTE FUNCTION public.update_lead_email_metrics();

-- Backfill existing rows
INSERT INTO public.lead_email_metrics (lead_id, total_sent, total_received, last_sent_date, last_received_date)
SELECT
  lead_id,
  COUNT(*) FILTER (WHERE direction = 'outbound'),
  COUNT(*) FILTER (WHERE direction = 'inbound'),
  MAX(email_date) FILTER (WHERE direction = 'outbound'),
  MAX(email_date) FILTER (WHERE direction = 'inbound')
FROM public.lead_emails
WHERE lead_id IS NOT NULL AND lead_id <> 'unmatched'
GROUP BY lead_id
ON CONFLICT (lead_id) DO NOTHING;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_email_metrics;
