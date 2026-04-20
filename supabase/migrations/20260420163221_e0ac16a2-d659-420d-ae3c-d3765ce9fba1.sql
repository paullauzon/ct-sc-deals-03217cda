ALTER TABLE public.lead_emails
  ADD COLUMN IF NOT EXISTS ai_drafted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_type text NOT NULL DEFAULT 'one_to_one',
  ADD COLUMN IF NOT EXISTS sequence_step text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_emails_email_type_check'
  ) THEN
    ALTER TABLE public.lead_emails
      ADD CONSTRAINT lead_emails_email_type_check
      CHECK (email_type IN ('one_to_one','marketing','transactional','sequence'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS lead_emails_lead_type_date_idx
  ON public.lead_emails (lead_id, email_type, email_date DESC);