-- no-transaction

ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS post_type VARCHAR(40) NOT NULL DEFAULT 'update';
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS context VARCHAR(40);
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS comment_visibility VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS external_url TEXT;
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE discover_posts ADD COLUMN IF NOT EXISTS spam_score DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS is_answer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS helpful_count BIGINT NOT NULL DEFAULT 0;

ALTER TABLE post_stats ADD COLUMN IF NOT EXISTS save_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE post_stats ADD COLUMN IF NOT EXISTS share_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE post_stats ADD COLUMN IF NOT EXISTS project_click_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE post_stats ADD COLUMN IF NOT EXISTS impression_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE post_stats ADD COLUMN IF NOT EXISTS helpful_count BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_media (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE IF NOT EXISTS post_saves (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_mentions (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, mentioned_user_id)
);

CREATE TABLE IF NOT EXISTS post_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comment_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(80) NOT NULL,
  details TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_hides (
  post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_mutes (
  muter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (muter_id, muted_user_id)
);

CREATE TABLE IF NOT EXISTS discover_user_interests (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  contexts TEXT[] NOT NULL DEFAULT '{}',
  technologies TEXT[] NOT NULL DEFAULT '{}',
  goals TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discover_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  post_id UUID REFERENCES discover_posts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL DEFAULT 1 CHECK (value IN (1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_posts_type_created ON discover_posts(post_type, created_at DESC, id DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_posts_context_created ON discover_posts(context, created_at DESC, id DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_posts_external_url ON discover_posts(user_id, external_url, created_at DESC) WHERE external_url IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_media_post_sort ON post_media(post_id, sort_order, media_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_saves_user_created ON post_saves(user_id, created_at DESC, post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_reports_status_created ON post_reports(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comment_reports_status_created ON comment_reports(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_hides_user_post ON post_hides(user_id, post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_mutes_muter_muted ON user_mutes(muter_id, muted_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_events_post_type_created ON discover_events(post_id, event_type, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_events_user_created ON discover_events(user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comment_votes_user_comment ON comment_votes(user_id, comment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_parent_created ON post_comments(parent_comment_id, created_at, id) WHERE deleted_at IS NULL;

INSERT INTO post_stats(post_id, like_count, comment_count, save_count, helpful_count)
SELECT p.id,
       COUNT(DISTINCT l.id),
       COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL),
       COUNT(DISTINCT s.user_id),
       COUNT(DISTINCT cv.user_id)
FROM discover_posts p
LEFT JOIN post_likes l ON l.post_id = p.id
LEFT JOIN post_comments c ON c.post_id = p.id
LEFT JOIN post_saves s ON s.post_id = p.id
LEFT JOIN comment_votes cv ON cv.comment_id = c.id
GROUP BY p.id
ON CONFLICT(post_id) DO UPDATE SET
  like_count = EXCLUDED.like_count,
  comment_count = EXCLUDED.comment_count,
  save_count = EXCLUDED.save_count,
  helpful_count = EXCLUDED.helpful_count,
  updated_at = NOW();
