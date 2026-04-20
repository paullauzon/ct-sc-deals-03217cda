ALTER TABLE public.lead_activity_log
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_lead_activity_log_actor_user_id
  ON public.lead_activity_log(actor_user_id);