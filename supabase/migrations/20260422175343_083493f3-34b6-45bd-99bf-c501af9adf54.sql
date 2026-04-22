-- Round 7 schema additions

-- Per-message classification reason (audit trail for routing decisions)
ALTER TABLE public.lead_emails
  ADD COLUMN IF NOT EXISTS classification_reason text DEFAULT '';

-- Memory of senders auto-classified as noise (high-volume, list-unsubscribe, etc.)
CREATE TABLE IF NOT EXISTS public.auto_classified_noise_senders (
  sender text PRIMARY KEY,
  classified_as text NOT NULL DEFAULT 'role_based',
  reason text NOT NULL DEFAULT '',
  message_count integer NOT NULL DEFAULT 0,
  classified_at timestamp with time zone NOT NULL DEFAULT now(),
  classified_by uuid
);

ALTER TABLE public.auto_classified_noise_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access auto_classified_noise_senders"
  ON public.auto_classified_noise_senders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Global email send suppression (hard bounces, manual blocks)
CREATE TABLE IF NOT EXISTS public.email_send_suppression (
  email text PRIMARY KEY,
  reason text NOT NULL DEFAULT '',
  source_lead_id text DEFAULT '',
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  added_by uuid
);

ALTER TABLE public.email_send_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access email_send_suppression"
  ON public.email_send_suppression
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Index to speed lookups during sync/claim passes
CREATE INDEX IF NOT EXISTS idx_lead_emails_classification_reason
  ON public.lead_emails (classification_reason)
  WHERE classification_reason <> '';