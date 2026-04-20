-- Pipeline v2: nurture sequence + lost reason v2 + gate audit + display fields

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS nurture_sequence_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nurture_started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nurture_re_engage_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lost_reason_v2 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stage_gate_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discovery_call_completed_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_nurture_status ON public.leads(nurture_sequence_status) WHERE nurture_sequence_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_nurture_re_engage ON public.leads(nurture_re_engage_date) WHERE nurture_re_engage_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);

-- Soft-warn trigger (logs gate gaps to lead_activity_log; does NOT block writes — UI handles hard gating)
CREATE OR REPLACE FUNCTION public.enforce_stage_v2_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  warnings text[] := ARRAY[]::text[];
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    -- Discovery Scheduled / Meeting Set → Discovery Completed / Meeting Held
    IF NEW.stage IN ('Discovery Completed', 'Meeting Held') AND COALESCE(NEW.fireflies_url, '') = '' AND COALESCE(jsonb_array_length(NEW.meetings), 0) = 0 THEN
      warnings := array_append(warnings, 'Missing Fireflies URL for Discovery Completed');
    END IF;

    -- Sample Sent gate
    IF NEW.stage = 'Sample Sent' AND COALESCE(NEW.sample_sent_date, '') = '' THEN
      NEW.sample_sent_date := to_char(now(), 'YYYY-MM-DD');
    END IF;

    -- Proposal Sent → Negotiating gate
    IF NEW.stage IN ('Negotiating', 'Negotiation') AND COALESCE(NEW.deal_value, 0) <= 100 THEN
      warnings := array_append(warnings, 'Deal value not set for Negotiating');
    END IF;

    -- Closed Lost requires lost_reason_v2
    IF NEW.stage IN ('Closed Lost', 'Lost', 'Went Dark') AND COALESCE(NEW.lost_reason_v2, '') = '' AND COALESCE(NEW.lost_reason, '') = '' THEN
      warnings := array_append(warnings, 'Missing lost reason');
    END IF;

    IF array_length(warnings, 1) > 0 THEN
      INSERT INTO public.lead_activity_log (lead_id, event_type, description, old_value, new_value)
      VALUES (NEW.id, 'gate_warning', 'Stage v2 gate gaps: ' || array_to_string(warnings, '; '), OLD.stage, NEW.stage);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_v2_gates ON public.leads;
CREATE TRIGGER trg_enforce_stage_v2_gates
  BEFORE UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stage_v2_gates();

-- Backfill: flag all R/R deals so the migration UI knows which to triage
UPDATE public.leads
SET nurture_sequence_status = 'needs_triage'
WHERE stage = 'Revisit/Reconnect'
  AND nurture_sequence_status IS NULL
  AND archived_at IS NULL;