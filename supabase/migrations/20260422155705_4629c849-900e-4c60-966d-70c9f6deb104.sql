
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
  old_was_real BOOLEAN := COALESCE(OLD.lead_id, '') NOT IN ('', 'unmatched');
  new_is_real BOOLEAN := COALESCE(NEW.lead_id, '') NOT IN ('', 'unmatched');
  lead_changed BOOLEAN := COALESCE(OLD.lead_id, '') IS DISTINCT FROM COALESCE(NEW.lead_id, '');
BEGIN
  IF NOT lead_changed THEN
    RETURN NEW;
  END IF;

  IF old_was_real THEN
    UPDATE public.lead_email_metrics SET
      total_sent     = GREATEST(0, total_sent     - CASE WHEN OLD.direction = 'outbound' THEN 1 ELSE 0 END),
      total_received = GREATEST(0, total_received - CASE WHEN OLD.direction = 'inbound'  THEN 1 ELSE 0 END),
      total_opens    = GREATEST(0, total_opens    - COALESCE(jsonb_array_length(OLD.opens), 0)),
      total_clicks   = GREATEST(0, total_clicks   - COALESCE(jsonb_array_length(OLD.clicks), 0)),
      total_bounces  = GREATEST(0, total_bounces  - CASE WHEN COALESCE(OLD.bounce_reason,'') <> '' THEN 1 ELSE 0 END),
      total_replies  = GREATEST(0, total_replies  - CASE WHEN OLD.replied_at IS NOT NULL THEN 1 ELSE 0 END),
      updated_at     = now()
    WHERE lead_id = OLD.lead_id;
  END IF;

  IF new_is_real THEN
    INSERT INTO public.lead_email_metrics (
      lead_id, total_sent, total_received, total_opens, total_clicks, total_bounces, total_replies,
      last_sent_date, last_received_date, last_opened_date, last_clicked_date, last_replied_date, last_bounce_date,
      updated_at
    ) VALUES (
      NEW.lead_id,
      CASE WHEN NEW.direction = 'outbound' THEN 1 ELSE 0 END,
      CASE WHEN NEW.direction = 'inbound'  THEN 1 ELSE 0 END,
      open_count, click_count,
      CASE WHEN is_bounce THEN 1 ELSE 0 END,
      CASE WHEN is_reply  THEN 1 ELSE 0 END,
      CASE WHEN NEW.direction = 'outbound' THEN NEW.email_date END,
      CASE WHEN NEW.direction = 'inbound'  THEN NEW.email_date END,
      CASE WHEN open_count > 0 THEN NEW.email_date END,
      CASE WHEN click_count > 0 THEN NEW.email_date END,
      NEW.replied_at,
      CASE WHEN is_bounce THEN NEW.email_date END,
      now()
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      total_sent       = lead_email_metrics.total_sent     + EXCLUDED.total_sent,
      total_received   = lead_email_metrics.total_received + EXCLUDED.total_received,
      total_opens      = lead_email_metrics.total_opens    + EXCLUDED.total_opens,
      total_clicks     = lead_email_metrics.total_clicks   + EXCLUDED.total_clicks,
      total_bounces    = lead_email_metrics.total_bounces  + EXCLUDED.total_bounces,
      total_replies    = lead_email_metrics.total_replies  + EXCLUDED.total_replies,
      last_sent_date     = GREATEST(lead_email_metrics.last_sent_date,     EXCLUDED.last_sent_date),
      last_received_date = GREATEST(lead_email_metrics.last_received_date, EXCLUDED.last_received_date),
      last_opened_date   = GREATEST(lead_email_metrics.last_opened_date,   EXCLUDED.last_opened_date),
      last_clicked_date  = GREATEST(lead_email_metrics.last_clicked_date,  EXCLUDED.last_clicked_date),
      last_replied_date  = GREATEST(lead_email_metrics.last_replied_date,  EXCLUDED.last_replied_date),
      last_bounce_date   = GREATEST(lead_email_metrics.last_bounce_date,   EXCLUDED.last_bounce_date),
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_lead_email_metrics_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.lead_id, '') NOT IN ('', 'unmatched') THEN
    UPDATE public.lead_email_metrics SET
      total_sent     = GREATEST(0, total_sent     - CASE WHEN OLD.direction = 'outbound' THEN 1 ELSE 0 END),
      total_received = GREATEST(0, total_received - CASE WHEN OLD.direction = 'inbound'  THEN 1 ELSE 0 END),
      total_opens    = GREATEST(0, total_opens    - COALESCE(jsonb_array_length(OLD.opens), 0)),
      total_clicks   = GREATEST(0, total_clicks   - COALESCE(jsonb_array_length(OLD.clicks), 0)),
      total_bounces  = GREATEST(0, total_bounces  - CASE WHEN COALESCE(OLD.bounce_reason,'') <> '' THEN 1 ELSE 0 END),
      total_replies  = GREATEST(0, total_replies  - CASE WHEN OLD.replied_at IS NOT NULL THEN 1 ELSE 0 END),
      updated_at     = now()
    WHERE lead_id = OLD.lead_id;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lead_emails_metrics_insert ON public.lead_emails;
DROP TRIGGER IF EXISTS trg_lead_emails_metrics_claim  ON public.lead_emails;
DROP TRIGGER IF EXISTS trg_lead_emails_metrics_delete ON public.lead_emails;

CREATE TRIGGER trg_lead_emails_metrics_insert
  AFTER INSERT ON public.lead_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_lead_email_metrics();

CREATE TRIGGER trg_lead_emails_metrics_claim
  AFTER UPDATE OF lead_id ON public.lead_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_lead_email_metrics_on_claim();

CREATE TRIGGER trg_lead_emails_metrics_delete
  AFTER DELETE ON public.lead_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_lead_email_metrics_on_delete();
