
-- 1. New table: email_noise_domains
CREATE TABLE IF NOT EXISTS public.email_noise_domains (
  domain TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  added_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_noise_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access email_noise_domains"
ON public.email_noise_domains
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2. Seed with top 10 known noise domains from current unmatched bucket
INSERT INTO public.email_noise_domains (domain, reason) VALUES
  ('webforms.io', 'Lead-form notification system'),
  ('email.pandadoc.net', 'Document e-signature platform notifications'),
  ('mail.beehiiv.com', 'Newsletter platform'),
  ('fireflies.ai', 'Meeting transcript notifications (handled separately)'),
  ('acg.org', 'M&A association mass marketing'),
  ('calendly.com', 'Calendly notifications (handled separately)'),
  ('zoom.us', 'Zoom system notifications'),
  ('mail.investopedia.com', 'Investopedia newsletter'),
  ('webflow.com', 'Website platform system mail'),
  ('connectoutbound.com', 'Cold-outreach tool notifications')
ON CONFLICT (domain) DO NOTHING;

-- 3. Schedule the daily cleanup cron at 4 AM UTC
SELECT cron.schedule(
  'cleanup-unmatched-noise-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qlvlftqzctywlrsdlyty.supabase.co/functions/v1/cleanup-unmatched-noise',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('triggered_by', 'cron', 'time', now()::text)
  );
  $$
);
