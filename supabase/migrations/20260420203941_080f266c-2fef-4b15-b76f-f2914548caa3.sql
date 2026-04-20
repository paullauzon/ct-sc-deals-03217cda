-- Gap 2: stream lead_emails INSERT/UPDATE/DELETE to subscribed clients
ALTER TABLE public.lead_emails REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lead_emails'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_emails';
  END IF;
END $$;

-- Gap 4: when an unmatched email is claimed to a lead, roll up metrics
CREATE OR REPLACE FUNCTION public.update_lead_email_metrics_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  open_count INTEGER := COALESCE(jsonb_array_length(NEW.opens), 0);
  click_count INTEGER := COALESCE(jsonb_array_length(NEW.clicks), 0);
  is_bounce BOOLEAN := COALESCE(NEW.bounce_reason, '') <> '';
  is_reply BOOLEAN := NEW.replied_at IS NOT NULL;
BEGIN
  -- Only react when an email moves from unmatched (or NULL) to a real lead
  IF (COALESCE(OLD.lead_id, '') IN ('', 'unmatched'))
     AND NEW.lead_id IS NOT NULL
     AND NEW.lead_id <> ''
     AND NEW.lead_id <> 'unmatched' THEN

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
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_update_lead_email_metrics_on_claim ON public.lead_emails;

CREATE TRIGGER trg_update_lead_email_metrics_on_claim
AFTER UPDATE OF lead_id ON public.lead_emails
FOR EACH ROW
EXECUTE FUNCTION public.update_lead_email_metrics_on_claim();