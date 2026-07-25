-- Supabase Auth migration (part 2 of 3): import existing accounts into GoTrue.
--
-- Every public.users row becomes an auth.users row with the SAME uuid, so every
-- foreign key that references users(id) — projects, portfolio_settings,
-- background_jobs, endorsements, teams, … — keeps working with no remap.
--
-- Deliberately transactional. The foreign key at the bottom is the verification
-- step: if a single profile failed to import, the constraint cannot be added and
-- the whole migration rolls back, rather than leaving a half-migrated database.
--
-- Idempotent: every insert is guarded by NOT EXISTS, so a re-run is a no-op.
--
-- bcryptjs emits $2a$ hashes and GoTrue verifies bcrypt natively, so
-- password_hash transfers verbatim and existing passwords keep working.

-- ── Pre-flight ───────────────────────────────────────────────────────────────
-- Fail before touching anything if the source data cannot produce a valid login.
DO $$
DECLARE
  bad_email      int;
  dup_email      int;
  no_credential  int;
  bad_hash       int;
BEGIN
  SELECT count(*) INTO bad_email FROM public.users WHERE email IS NULL OR email = '';
  IF bad_email > 0 THEN
    RAISE EXCEPTION 'Import aborted: % profile(s) have no email', bad_email;
  END IF;

  SELECT count(*) INTO dup_email FROM (
    SELECT lower(email) FROM public.users GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dup_email > 0 THEN
    RAISE EXCEPTION 'Import aborted: % email(s) collide case-insensitively; auth.users requires uniqueness', dup_email;
  END IF;

  SELECT count(*) INTO no_credential FROM public.users
   WHERE password_hash IS NULL AND google_id IS NULL AND github_id IS NULL AND linkedin_id IS NULL;
  IF no_credential > 0 THEN
    RAISE EXCEPTION 'Import aborted: % profile(s) have no password and no linked provider and could never sign in', no_credential;
  END IF;

  SELECT count(*) INTO bad_hash FROM public.users
   WHERE password_hash IS NOT NULL AND password_hash !~ '^\$2[aby]\$';
  IF bad_hash > 0 THEN
    RAISE EXCEPTION 'Import aborted: % password hash(es) are not bcrypt; GoTrue cannot verify them', bad_hash;
  END IF;
END;
$$;

-- ── 1. auth.users ────────────────────────────────────────────────────────────
-- confirmation_token / recovery_token / email_change* / phone_change* /
-- reauthentication_token are nullable in the DDL but GoTrue scans them into
-- non-nullable Go strings. A NULL there produces
--   "sql: Scan error ... converting NULL to string is unsupported"
-- and every imported user's login fails with a 500. They MUST be ''.
--
-- confirmed_at is GENERATED ALWAYS (LEAST(email_confirmed_at, phone_confirmed_at))
-- and is deliberately absent from this column list.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token,
  is_sso_user, is_anonymous
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  u.id,
  'authenticated',
  'authenticated',
  left(lower(u.email), 255),
  u.password_hash,
  -- Confirm every migrated account unconditionally. Only 2 of 79 carry
  -- is_email_verified, and gating on it would lock 77 working accounts out the
  -- moment "Confirm email" is switched on. Their password already proves custody.
  COALESCE(u.created_at, now()),
  NULL,
  jsonb_build_object('provider', p.providers[1], 'providers', to_jsonb(p.providers)),
  jsonb_strip_nulls(jsonb_build_object(
    'full_name',      u.full_name,
    'username',       u.username,
    'avatar_url',     u.avatar_url,
    'email',          lower(u.email),
    'email_verified', true,
    'phone_verified', false
  )),
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now()),
  '', '',
  '', '', '',
  '', '', '',
  false, false
FROM public.users u
CROSS JOIN LATERAL (
  SELECT array_remove(ARRAY[
    CASE WHEN u.password_hash IS NOT NULL THEN 'email'         END,
    CASE WHEN u.google_id     IS NOT NULL THEN 'google'        END,
    CASE WHEN u.github_id     IS NOT NULL THEN 'github'        END,
    CASE WHEN u.linkedin_id   IS NOT NULL THEN 'linkedin_oidc' END
  ]::text[], NULL) AS providers
) p
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);

-- ── 2. auth.identities: the email identity for password accounts ─────────────
-- Modern GoTrue creates one of these on every password signup. Without it the
-- account shows no provider in the dashboard and identity linking/unlinking
-- misbehaves. provider_id for an email identity is the user's own uuid as text.
-- auth.identities.email is GENERATED ALWAYS from identity_data->>'email'.
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object(
    'sub',            u.id::text,
    'email',          lower(u.email),
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  NULL,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.users u
WHERE u.password_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.provider = 'email' AND i.provider_id = u.id::text
  );

-- ── 3. auth.identities: social providers ─────────────────────────────────────
-- google_id / github_id / linkedin_id all hold the provider's `sub` claim, which
-- is exactly what auth.identities.provider_id stores, so a future social login
-- re-links to the SAME account instead of creating a duplicate.
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  s.provider_id,
  u.id,
  jsonb_build_object(
    'sub',            s.provider_id,
    'email',          lower(u.email),
    'email_verified', true,
    'phone_verified', false
  ),
  s.provider,
  NULL,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.users u
CROSS JOIN LATERAL (VALUES
  ('google',        u.google_id),
  ('github',        u.github_id),
  ('linkedin_oidc', u.linkedin_id)
) AS s(provider, provider_id)
WHERE s.provider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.provider = s.provider AND i.provider_id = s.provider_id
  );

-- ── 4. Link the profile table to the identity table ──────────────────────────
-- This is the verification step. If any profile did not import, ADD CONSTRAINT
-- fails and the whole migration rolls back. ON DELETE CASCADE means deleting a
-- Supabase auth user removes the profile (and everything FK'd to it) as well.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
