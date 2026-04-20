DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_drafts_lead_action_key_uniq'
  ) THEN
    DELETE FROM public.lead_drafts a
    USING public.lead_drafts b
    WHERE a.lead_id = b.lead_id
      AND a.action_key = b.action_key
      AND a.id < b.id;

    ALTER TABLE public.lead_drafts
      ADD CONSTRAINT lead_drafts_lead_action_key_uniq
      UNIQUE (lead_id, action_key);
  END IF;
END$$;