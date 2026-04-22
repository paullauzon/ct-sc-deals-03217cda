-- Drop the two legacy duplicate triggers on lead_emails. The newer
-- trg_lead_emails_metrics_{insert,claim,delete} set is the canonical one;
-- the legacy pair is causing every insert/reassignment to be counted twice
-- and is the root cause of the recurring lead_email_metrics drift.
DROP TRIGGER IF EXISTS trg_update_lead_email_metrics ON public.lead_emails;
DROP TRIGGER IF EXISTS trg_update_lead_email_metrics_on_claim ON public.lead_emails;