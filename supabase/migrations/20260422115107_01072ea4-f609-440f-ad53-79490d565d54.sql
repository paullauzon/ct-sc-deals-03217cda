
CREATE TABLE IF NOT EXISTS public.email_compose_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  email_id UUID,
  user_id UUID,
  brand TEXT NOT NULL DEFAULT 'Captarget',
  stage TEXT NOT NULL DEFAULT '',
  firm_type TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT 'free_form',
  drafts_offered JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_approach TEXT NOT NULL DEFAULT '',
  draft_picked TEXT NOT NULL DEFAULT '',
  picked_index INTEGER NOT NULL DEFAULT -1,
  initial_subject TEXT NOT NULL DEFAULT '',
  initial_body TEXT NOT NULL DEFAULT '',
  final_subject TEXT NOT NULL DEFAULT '',
  final_body TEXT NOT NULL DEFAULT '',
  edit_distance_subject INTEGER NOT NULL DEFAULT 0,
  edit_distance_body INTEGER NOT NULL DEFAULT 0,
  edit_distance_pct NUMERIC NOT NULL DEFAULT 0,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  scheduled BOOLEAN NOT NULL DEFAULT false,
  do_not_train BOOLEAN NOT NULL DEFAULT false,
  model TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_compose_events_lead ON public.email_compose_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_compose_events_train_lookup
  ON public.email_compose_events(brand, stage, purpose, draft_picked)
  WHERE do_not_train = false AND sent = true;
ALTER TABLE public.email_compose_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated team can access email_compose_events"
  ON public.email_compose_events FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.email_compose_outcomes (
  event_id UUID PRIMARY KEY REFERENCES public.email_compose_events(id) ON DELETE CASCADE,
  email_id UUID NOT NULL,
  opened BOOLEAN NOT NULL DEFAULT false,
  open_count INTEGER NOT NULL DEFAULT 0,
  clicked BOOLEAN NOT NULL DEFAULT false,
  click_count INTEGER NOT NULL DEFAULT 0,
  replied BOOLEAN NOT NULL DEFAULT false,
  replied_at TIMESTAMPTZ,
  stage_advanced BOOLEAN NOT NULL DEFAULT false,
  stage_before TEXT NOT NULL DEFAULT '',
  stage_after TEXT NOT NULL DEFAULT '',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_compose_outcomes_email ON public.email_compose_outcomes(email_id);
ALTER TABLE public.email_compose_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated team can access email_compose_outcomes"
  ON public.email_compose_outcomes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
