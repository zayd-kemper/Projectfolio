-- Supabase Auth migration (part 1 of 3): profile provisioning + email sync.
--
-- After GoTrue writes auth.users (email signup or any social provider), mirror the
-- identity into the public.users profile table and create default portfolio_settings.
-- Import-safe: if a profile already exists for the id (the Task-3 import), it no-ops.
--
-- Runs as the `postgres` role, which holds TRIGGER on auth.users (owned by
-- supabase_auth_admin). The functions are SECURITY DEFINER so they can write the
-- public schema when invoked by supabase_auth_admin during a signup.
--
-- Anything that RAISEs in handle_new_user surfaces to the client as
-- "Database error saving new user" and fails the signup outright, so every branch
-- below is defensive about nulls and length limits.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta       jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_email    text  := lower(COALESCE(NEW.email, ''));
  v_local    text  := NULLIF(split_part(v_email, '@', 1), '');
  v_full     text;
  v_avatar   text;
  v_base     text;
  v_username text;
  v_try      int   := 0;
BEGIN
  -- Import-safe: profiles that already exist keep their row untouched.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF v_email = '' THEN
    RAISE EXCEPTION 'handle_new_user: auth user % has no email', NEW.id;
  END IF;

  -- public.users.full_name is NOT NULL, so this must always resolve to something.
  v_full := COALESCE(
    NULLIF(meta->>'full_name', ''),
    NULLIF(meta->>'name', ''),
    NULLIF(meta->>'user_name', ''),
    v_local,
    'ProjectFolio user'
  );
  v_avatar := COALESCE(NULLIF(meta->>'avatar_url', ''), NULLIF(meta->>'picture', ''));

  -- Fold case BEFORE stripping: the [^a-z0-9-] class would otherwise delete every
  -- uppercase letter ('MayaIyer' -> 'ayayer' instead of 'mayaiyer').
  v_base := regexp_replace(
    lower(COALESCE(
      NULLIF(meta->>'username', ''),
      NULLIF(meta->>'user_name', ''),
      v_full,
      v_local
    )),
    '[^a-z0-9-]', '', 'g');
  v_base := left(NULLIF(v_base, ''), 40);
  IF v_base IS NULL THEN v_base := 'user'; END IF;

  -- Bounded: a few random suffixes, then a uuid-derived suffix that cannot collide.
  v_username := v_base;
  WHILE v_try < 5 AND EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_try := v_try + 1;
    v_username := left(v_base, 34) || '-' || floor(random() * 9000 + 1000)::int;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.users WHERE username = v_username) THEN
    v_username := left(v_base, 27) || '-' || left(replace(NEW.id::text, '-', ''), 12);
  END IF;

  INSERT INTO public.users (id, email, full_name, username, avatar_url, is_email_verified)
  VALUES (
    NEW.id,
    left(v_email, 255),
    left(v_full, 255),
    left(v_username, 100),
    left(v_avatar, 500),
    NEW.email_confirmed_at IS NOT NULL
  )
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

-- Keep the profile mirror honest when Supabase owns the email.
-- supabase.auth.updateUser({ email }) and the confirm-email round trip both land
-- here; without this, public.users.email (UNIQUE NOT NULL, read by /auth/me,
-- Discover, and the public portfolio pages) silently goes stale.
CREATE OR REPLACE FUNCTION public.handle_user_email_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET email             = left(lower(COALESCE(NEW.email, email)), 255),
         is_email_verified = NEW.email_confirmed_at IS NOT NULL,
         updated_at        = now()
   WHERE id = NEW.id
     AND (
       email IS DISTINCT FROM left(lower(COALESCE(NEW.email, email)), 255)
       OR is_email_verified IS DISTINCT FROM (NEW.email_confirmed_at IS NOT NULL)
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_sync ON auth.users;
CREATE TRIGGER on_auth_user_email_sync
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_email_sync();
