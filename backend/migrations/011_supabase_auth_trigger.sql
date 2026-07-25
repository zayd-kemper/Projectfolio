-- Supabase Auth migration (part 1): profile-provisioning trigger.
--
-- After Supabase Auth (GoTrue) creates a row in auth.users (email signup or any
-- social provider), auto-create the matching public.users profile row and its
-- default portfolio_settings. Import-safe: if the profile id already exists
-- (existing users imported into auth.users), it does nothing.
--
-- Applied via Supabase migration tooling. Idempotent (CREATE OR REPLACE + guarded).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta       jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full     text  := COALESCE(NULLIF(meta->>'full_name',''), NULLIF(meta->>'name',''), split_part(NEW.email,'@',1));
  v_avatar   text  := COALESCE(NULLIF(meta->>'avatar_url',''), NULLIF(meta->>'picture',''));
  v_base     text;
  v_username text;
BEGIN
  -- Import-safe: existing profiles keep their row untouched.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Derive a url-safe, unique username from metadata / name / email local-part.
  v_base := lower(regexp_replace(
    COALESCE(NULLIF(meta->>'username',''), v_full, split_part(NEW.email,'@',1)),
    '[^a-z0-9-]', '', 'g'));
  v_base := left(NULLIF(v_base, ''), 40);
  IF v_base IS NULL OR v_base = '' THEN v_base := 'user'; END IF;
  v_username := v_base;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_username := left(v_base, 34) || '-' || floor(random() * 9999)::int;
  END LOOP;

  INSERT INTO public.users (id, email, full_name, username, avatar_url, is_email_verified)
  VALUES (NEW.id, NEW.email, v_full, v_username, v_avatar, NEW.email_confirmed_at IS NOT NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.portfolio_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
