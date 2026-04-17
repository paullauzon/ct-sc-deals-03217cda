-- ============ client_accounts ============
CREATE TABLE public.client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL DEFAULT 'Captarget',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  company_url TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT 'Valeria',
  cs_stage TEXT NOT NULL DEFAULT 'Onboarding',
  onboarded_date DATE,
  contract_start DATE,
  contract_end DATE,
  contract_months INTEGER,
  monthly_value NUMERIC NOT NULL DEFAULT 0,
  retainer_value NUMERIC NOT NULL DEFAULT 0,
  success_fee_pct NUMERIC NOT NULL DEFAULT 0,
  service_type TEXT NOT NULL DEFAULT '',
  deal_amount NUMERIC NOT NULL DEFAULT 0,
  mandate_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  pause_reason TEXT NOT NULL DEFAULT '',
  pause_credit NUMERIC NOT NULL DEFAULT 0,
  resume_date DATE,
  paused_at TIMESTAMPTZ,
  churn_reason TEXT NOT NULL DEFAULT '',
  churn_date DATE,
  re_engage_date DATE,
  renewal_flagged_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_accounts_stage ON public.client_accounts(cs_stage);
CREATE INDEX idx_client_accounts_lead_id ON public.client_accounts(lead_id);
CREATE INDEX idx_client_accounts_brand ON public.client_accounts(brand);

ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to client_accounts"
  ON public.client_accounts FOR ALL USING (true) WITH CHECK (true);

-- ============ client_account_tasks ============
CREATE TABLE public.client_account_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sequence_order INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_account_tasks_account ON public.client_account_tasks(account_id);
CREATE INDEX idx_client_account_tasks_status ON public.client_account_tasks(status);

ALTER TABLE public.client_account_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to client_account_tasks"
  ON public.client_account_tasks FOR ALL USING (true) WITH CHECK (true);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.touch_client_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_client_accounts_updated_at
  BEFORE UPDATE ON public.client_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_accounts_updated_at();

-- ============ Auto-handoff trigger ============
CREATE OR REPLACE FUNCTION public.handle_closed_won()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account_id UUID;
  v_contract_start DATE;
  v_contract_end DATE;
  v_contract_months INTEGER;
BEGIN
  IF NEW.stage = 'Closed Won' AND (OLD.stage IS DISTINCT FROM 'Closed Won') THEN
    -- Skip if account already exists for this lead
    IF EXISTS (SELECT 1 FROM public.client_accounts WHERE lead_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    -- Parse contract dates safely
    BEGIN v_contract_start := NULLIF(NEW.contract_start,'')::DATE; EXCEPTION WHEN OTHERS THEN v_contract_start := CURRENT_DATE; END;
    BEGIN v_contract_end := NULLIF(NEW.contract_end,'')::DATE; EXCEPTION WHEN OTHERS THEN v_contract_end := NULL; END;
    v_contract_months := COALESCE(NEW.contract_months, 12);
    IF v_contract_end IS NULL AND v_contract_start IS NOT NULL THEN
      v_contract_end := v_contract_start + (v_contract_months || ' months')::INTERVAL;
    END IF;

    INSERT INTO public.client_accounts (
      lead_id, brand, contact_name, contact_email, company, company_url,
      owner, cs_stage, onboarded_date, contract_start, contract_end, contract_months,
      monthly_value, service_type, deal_amount, notes
    ) VALUES (
      NEW.id, NEW.brand, NEW.name, NEW.email, NEW.company, COALESCE(NEW.company_url, ''),
      'Valeria', 'Onboarding', CURRENT_DATE,
      COALESCE(v_contract_start, CURRENT_DATE), v_contract_end, v_contract_months,
      COALESCE(NEW.subscription_value, 0), COALESCE(NEW.service_interest, ''),
      COALESCE(NEW.deal_value, 0), ''
    )
    RETURNING id INTO v_account_id;

    -- Seed onboarding tasks
    INSERT INTO public.client_account_tasks (account_id, task_type, title, description, due_date, sequence_order)
    VALUES
      (v_account_id, 'onboarding_guide', 'Send onboarding guide (48h SLA)',
       'Email the standard onboarding guide and confirm kick-off date.', CURRENT_DATE + 2, 1),
      (v_account_id, 'buyers_profile', 'Send Buyers Profile form',
       'Collect target criteria, geography, and decision-maker contacts.', CURRENT_DATE + 3, 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_closed_won_handoff
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_closed_won();

-- ============ Backfill 4 existing Closed Won deals into Active ============
INSERT INTO public.client_accounts (
  lead_id, brand, contact_name, contact_email, company, company_url,
  owner, cs_stage, onboarded_date, contract_start, contract_end, contract_months,
  monthly_value, service_type, deal_amount, notes
)
SELECT
  l.id, l.brand, l.name, l.email, l.company, COALESCE(l.company_url, ''),
  'Valeria', 'Active',
  COALESCE(NULLIF(l.contract_start,'')::DATE, CURRENT_DATE - 30),
  COALESCE(NULLIF(l.contract_start,'')::DATE, CURRENT_DATE - 30),
  COALESCE(NULLIF(l.contract_end,'')::DATE,
    COALESCE(NULLIF(l.contract_start,'')::DATE, CURRENT_DATE - 30)
      + (COALESCE(l.contract_months, 12) || ' months')::INTERVAL),
  COALESCE(l.contract_months, 12),
  COALESCE(l.subscription_value, 0), COALESCE(l.service_interest, ''),
  COALESCE(l.deal_value, 0), 'Backfilled from existing Closed Won pipeline'
FROM public.leads l
WHERE l.stage = 'Closed Won'
  AND NOT EXISTS (SELECT 1 FROM public.client_accounts WHERE lead_id = l.id);