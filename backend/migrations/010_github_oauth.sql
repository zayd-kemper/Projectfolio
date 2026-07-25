-- GitHub OAuth identity linking (mirrors google_id / linkedin_id on users).

ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id VARCHAR(255);

-- One account per GitHub identity; partial so existing NULLs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_key ON users (github_id) WHERE github_id IS NOT NULL;
