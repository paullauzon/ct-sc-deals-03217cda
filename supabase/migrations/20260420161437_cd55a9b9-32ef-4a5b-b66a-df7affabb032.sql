-- 1. Drop the dead lead_status column
ALTER TABLE public.leads DROP COLUMN IF EXISTS lead_status;

-- 2. Backfill actor_name on pre-migration activity rows
UPDATE public.lead_activity_log
SET actor_name = 'System'
WHERE actor_name = '' AND actor_user_id IS NULL;