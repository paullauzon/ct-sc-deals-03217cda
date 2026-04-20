-- Pending invites table
CREATE TABLE IF NOT EXISTS public.pending_invites (
  email text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  role public.app_role NOT NULL DEFAULT 'rep',
  invited_by uuid,
  invited_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Admins can see/manage invites
CREATE POLICY "Admins can manage pending_invites"
ON public.pending_invites
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Update handle_new_user to consume pending_invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_count INTEGER;
  v_invite RECORD;
  v_name TEXT;
  v_role public.app_role;
BEGIN
  -- Look up pending invite (case-insensitive email match)
  SELECT * INTO v_invite FROM public.pending_invites
  WHERE lower(email) = lower(NEW.email) LIMIT 1;

  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    CASE WHEN v_invite.name IS NOT NULL AND v_invite.name <> '' THEN v_invite.name ELSE '' END
  );

  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, v_name, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_user_count FROM public.user_roles;

  IF v_invite.role IS NOT NULL THEN
    v_role := v_invite.role;
  ELSIF v_user_count = 0 THEN
    v_role := 'admin'::public.app_role;
  ELSE
    v_role := 'rep'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Consume the invite if it existed
  IF v_invite.email IS NOT NULL THEN
    DELETE FROM public.pending_invites WHERE email = v_invite.email;
  END IF;

  RETURN NEW;
END;
$function$;