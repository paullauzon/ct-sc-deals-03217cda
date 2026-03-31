ALTER TABLE public.leads ADD COLUMN calendly_event_name text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN calendly_event_type text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN calendly_event_duration integer;