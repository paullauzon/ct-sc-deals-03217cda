-- 1. firm_activity_emails: emails set aside as firm-wide context
CREATE TABLE public.firm_activity_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id UUID NOT NULL UNIQUE,
  firm_domain TEXT NOT NULL,
  set_aside_by UUID,
  set_aside_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_firm_activity_emails_domain ON public.firm_activity_emails(firm_domain);
CREATE INDEX idx_firm_activity_emails_email_id ON public.firm_activity_emails(email_id);

ALTER TABLE public.firm_activity_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access firm_activity_emails"
ON public.firm_activity_emails FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 2. lead_email_filters: per-lead noise rules
CREATE TABLE public.lead_email_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id TEXT NOT NULL,
  sender_pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL DEFAULT 'domain', -- 'domain' | 'email'
  action TEXT NOT NULL DEFAULT 'hide',         -- 'hide' | 'noise'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (lead_id, sender_pattern)
);

CREATE INDEX idx_lead_email_filters_lead_id ON public.lead_email_filters(lead_id);

ALTER TABLE public.lead_email_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access lead_email_filters"
ON public.lead_email_filters FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 3. pending_attribution_suggestions: system-generated routing suggestions
CREATE TABLE public.pending_attribution_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_email TEXT NOT NULL,
  sender_domain TEXT NOT NULL,
  suggested_lead_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  email_count INTEGER NOT NULL DEFAULT 0,
  sample_email_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sender_email, suggested_lead_id, status)
);

CREATE INDEX idx_pending_attr_status ON public.pending_attribution_suggestions(status);
CREATE INDEX idx_pending_attr_domain ON public.pending_attribution_suggestions(sender_domain);

ALTER TABLE public.pending_attribution_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated team can access pending_attribution_suggestions"
ON public.pending_attribution_suggestions FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 4. is_intermediary on lead_stakeholders
ALTER TABLE public.lead_stakeholders
  ADD COLUMN is_intermediary BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_lead_stakeholders_intermediary
  ON public.lead_stakeholders(email)
  WHERE is_intermediary = true;