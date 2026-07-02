CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS linkedin_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS identity_mode VARCHAR(50),
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_document TSVECTOR;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS content_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS search_document TSVECTOR;
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS search_document TSVECTOR;
ALTER TABLE integration_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
DO $$ BEGIN
  ALTER TABLE invitations ADD COLUMN IF NOT EXISTS token_hash BYTEA;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping invitations.token_hash; secure_token_registry will be used';
END $$;
DO $$ BEGIN
  ALTER TABLE endorsements ADD COLUMN IF NOT EXISTS token_hash BYTEA;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping endorsements.token_hash; secure_token_registry will be used';
END $$;
ALTER TABLE portfolio_views ADD COLUMN IF NOT EXISTS visitor_hash BYTEA;

DO $$ BEGIN
  ALTER TABLE invitations ALTER COLUMN invite_token DROP NOT NULL;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE endorsements ALTER COLUMN token DROP NOT NULL;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS secure_token_registry (
  entity_type VARCHAR(30) NOT NULL, entity_id UUID NOT NULL, token_hash BYTEA UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(entity_type, entity_id)
);
INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
SELECT 'invitation', id, digest(invite_token, 'sha256') FROM invitations WHERE invite_token IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO secure_token_registry(entity_type, entity_id, token_hash)
SELECT 'endorsement', id, digest(token, 'sha256') FROM endorsements WHERE token IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE invitations SET invite_token = encode(digest(invite_token, 'sha256'), 'hex') WHERE invite_token IS NOT NULL;
UPDATE endorsements SET token = encode(digest(token, 'sha256'), 'hex') WHERE token IS NOT NULL;

CREATE OR REPLACE FUNCTION projectfolio_search_vector_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    NEW.search_document := to_tsvector('simple', concat_ws(' ', NEW.full_name, NEW.username, NEW.headline, NEW.bio, array_to_string(NEW.skills, ' ')));
  ELSIF TG_TABLE_NAME = 'projects' THEN
    NEW.search_document := to_tsvector('simple', concat_ws(' ', NEW.title, NEW.tagline, NEW.description, NEW.project_type, array_to_string(NEW.technologies, ' ')));
  ELSE
    NEW.search_document := to_tsvector('simple', concat_ws(' ', NEW.title, NEW.body));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_search_vector_trigger ON users;
CREATE TRIGGER users_search_vector_trigger BEFORE INSERT OR UPDATE OF full_name, username, headline, bio, skills ON users
FOR EACH ROW EXECUTE FUNCTION projectfolio_search_vector_update();
DROP TRIGGER IF EXISTS projects_search_vector_trigger ON projects;
CREATE TRIGGER projects_search_vector_trigger BEFORE INSERT OR UPDATE OF title, tagline, description, project_type, technologies ON projects
FOR EACH ROW EXECUTE FUNCTION projectfolio_search_vector_update();
DROP TRIGGER IF EXISTS posts_search_vector_trigger ON discover_posts;
CREATE TRIGGER posts_search_vector_trigger BEFORE INSERT OR UPDATE OF title, body ON discover_posts
FOR EACH ROW EXECUTE FUNCTION projectfolio_search_vector_update();

UPDATE users SET search_document = to_tsvector('simple', concat_ws(' ', full_name, username, headline, bio, array_to_string(skills, ' '))) WHERE search_document IS NULL;
UPDATE projects SET search_document = to_tsvector('simple', concat_ws(' ', title, tagline, description, project_type, array_to_string(technologies, ' '))) WHERE search_document IS NULL;
UPDATE discover_posts SET search_document = to_tsvector('simple', concat_ws(' ', title, body)) WHERE search_document IS NULL;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BYTEA UNIQUE NOT NULL, family_id UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ, replaced_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(80) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
  input JSONB NOT NULL DEFAULT '{}', result JSONB, error TEXT, idempotency_key VARCHAR(200), attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  UNIQUE(user_id, type, idempotency_key)
);

CREATE TABLE IF NOT EXISTS portfolio_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version BIGINT NOT NULL, snapshot JSONB NOT NULL, reason VARCHAR(100), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, UNIQUE(user_id, version)
);
ALTER TABLE ai_change_sets ADD COLUMN IF NOT EXISTS before_revision_id UUID REFERENCES portfolio_revisions(id) ON DELETE SET NULL;
ALTER TABLE ai_change_sets ADD COLUMN IF NOT EXISTS after_revision_id UUID REFERENCES portfolio_revisions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID NOT NULL DEFAULT uuid_generate_v4(), subject_type VARCHAR(20) NOT NULL,
  subject_id UUID NOT NULL, project_id UUID, visitor_hash BYTEA, referrer_source VARCHAR(30) NOT NULL DEFAULT 'direct',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(id, created_at)
) PARTITION BY RANGE(created_at);

DO $$
DECLARE
  month_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
  partition_start DATE;
  partition_end DATE;
  partition_name TEXT;
BEGIN
  FOR month_offset IN 0..12 LOOP
    partition_start := (month_start + (month_offset || ' months')::INTERVAL)::DATE;
    partition_end := (month_start + ((month_offset + 1) || ' months')::INTERVAL)::DATE;
    partition_name := 'analytics_events_' || to_char(partition_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF analytics_events FOR VALUES FROM (%L) TO (%L)',
      partition_name, partition_start, partition_end
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS analytics_events_default PARTITION OF analytics_events DEFAULT;

CREATE TABLE IF NOT EXISTS analytics_daily (
  subject_type VARCHAR(20) NOT NULL, subject_id UUID NOT NULL,
  project_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  day DATE NOT NULL, referrer_source VARCHAR(30) NOT NULL DEFAULT 'direct', views BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(subject_type, subject_id, day, referrer_source, project_id)
);
CREATE TABLE IF NOT EXISTS analytics_subject_visitors (
  subject_type VARCHAR(20) NOT NULL, subject_id UUID NOT NULL, visitor_hash BYTEA NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(subject_type, subject_id, visitor_hash)
);
CREATE TABLE IF NOT EXISTS analytics_daily_visitors (
  subject_type VARCHAR(20) NOT NULL, subject_id UUID NOT NULL, day DATE NOT NULL, visitor_hash BYTEA NOT NULL,
  PRIMARY KEY(subject_type, subject_id, day, visitor_hash)
);

INSERT INTO analytics_daily (subject_type, subject_id, project_id, day, referrer_source, views)
SELECT CASE WHEN team_id IS NOT NULL THEN 'team' ELSE 'portfolio' END,
       COALESCE(team_id, user_id), COALESCE(project_id, '00000000-0000-0000-0000-000000000000'),
       created_at::date,
       CASE WHEN referrer IS NULL OR referrer = '' THEN 'direct'
            WHEN referrer ILIKE '%google.%' THEN 'google'
            WHEN referrer ILIKE '%linkedin.%' THEN 'linkedin'
            WHEN referrer ILIKE '%github.%' THEN 'github' ELSE 'referral' END,
       COUNT(*)
FROM portfolio_views WHERE COALESCE(team_id, user_id) IS NOT NULL
GROUP BY 1, 2, 3, 4, 5
ON CONFLICT (subject_type, subject_id, day, referrer_source, project_id)
DO UPDATE SET views = GREATEST(analytics_daily.views, EXCLUDED.views);

INSERT INTO analytics_subject_visitors (subject_type, subject_id, visitor_hash, first_seen_at, last_seen_at)
SELECT CASE WHEN team_id IS NOT NULL THEN 'team' ELSE 'portfolio' END,
       COALESCE(team_id, user_id), digest(viewer_ip, 'sha256'), MIN(created_at), MAX(created_at)
FROM portfolio_views WHERE COALESCE(team_id, user_id) IS NOT NULL AND viewer_ip IS NOT NULL
GROUP BY 1, 2, 3 ON CONFLICT DO NOTHING;

INSERT INTO analytics_daily_visitors (subject_type, subject_id, day, visitor_hash)
SELECT DISTINCT CASE WHEN team_id IS NOT NULL THEN 'team' ELSE 'portfolio' END,
       COALESCE(team_id, user_id), created_at::date, digest(viewer_ip, 'sha256')
FROM portfolio_views WHERE COALESCE(team_id, user_id) IS NOT NULL AND viewer_ip IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS post_stats (
  post_id UUID PRIMARY KEY REFERENCES discover_posts(id) ON DELETE CASCADE, like_count BIGINT NOT NULL DEFAULT 0,
  comment_count BIGINT NOT NULL DEFAULT 0, trending_score DOUBLE PRECISION NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, follower_count BIGINT NOT NULL DEFAULT 0,
  following_count BIGINT NOT NULL DEFAULT 0, project_count BIGINT NOT NULL DEFAULT 0,
  total_views BIGINT NOT NULL DEFAULT 0, recent_views BIGINT NOT NULL DEFAULT 0,
  trending_score DOUBLE PRECISION NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO post_stats(post_id, like_count, comment_count)
SELECT p.id, COUNT(DISTINCT l.id), COUNT(DISTINCT c.id) FROM discover_posts p
LEFT JOIN post_likes l ON l.post_id = p.id LEFT JOIN post_comments c ON c.post_id = p.id
GROUP BY p.id ON CONFLICT(post_id) DO UPDATE SET like_count = EXCLUDED.like_count, comment_count = EXCLUDED.comment_count;

INSERT INTO user_stats(user_id, follower_count, following_count, project_count)
SELECT u.id, COUNT(DISTINCT f1.follower_id), COUNT(DISTINCT f2.following_id), COUNT(DISTINCT p.id)
FROM users u LEFT JOIN user_follows f1 ON f1.following_id = u.id LEFT JOIN user_follows f2 ON f2.follower_id = u.id
LEFT JOIN projects p ON p.user_id = u.id AND p.status = 'published' GROUP BY u.id
ON CONFLICT(user_id) DO UPDATE SET follower_count = EXCLUDED.follower_count, following_count = EXCLUDED.following_count, project_count = EXCLUDED.project_count;

CREATE OR REPLACE FUNCTION projectfolio_refresh_project_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_user UUID;
BEGIN
  affected_user := COALESCE(NEW.user_id, OLD.user_id);
  INSERT INTO user_stats(user_id, project_count, updated_at)
  SELECT affected_user, COUNT(*) FILTER (WHERE status = 'published'), NOW()
  FROM projects WHERE user_id = affected_user
  ON CONFLICT(user_id) DO UPDATE SET project_count = EXCLUDED.project_count, updated_at = NOW();
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS project_count_stats_trigger ON projects;
CREATE TRIGGER project_count_stats_trigger AFTER INSERT OR UPDATE OR DELETE ON projects
FOR EACH ROW EXECUTE FUNCTION projectfolio_refresh_project_count();
