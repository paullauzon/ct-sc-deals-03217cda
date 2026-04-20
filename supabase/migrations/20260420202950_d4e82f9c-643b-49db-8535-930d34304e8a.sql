-- Drop the redundant UNIQUE on message_id; provider_message_id is the real idempotency key.
ALTER TABLE public.lead_emails DROP CONSTRAINT IF EXISTS lead_emails_message_id_key;
DROP INDEX IF EXISTS public.lead_emails_message_id_key;

-- Keep a non-unique lookup index for thread/RFC822 lookups.
CREATE INDEX IF NOT EXISTS idx_lead_emails_message_id ON public.lead_emails (message_id);