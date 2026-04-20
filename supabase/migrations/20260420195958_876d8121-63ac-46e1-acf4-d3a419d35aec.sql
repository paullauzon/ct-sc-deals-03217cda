ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS nurture_step_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nurture_exit_reason text NOT NULL DEFAULT '';