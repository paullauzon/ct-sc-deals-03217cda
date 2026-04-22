ALTER TABLE public.lead_emails
ADD COLUMN IF NOT EXISTS canonical_thread_lead_id text;

CREATE INDEX IF NOT EXISTS idx_lead_emails_canonical_thread
ON public.lead_emails (thread_id, canonical_thread_lead_id)
WHERE thread_id IS NOT NULL AND thread_id <> '';