-- no-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_events_user_type_created
ON discover_events(user_id, event_type, created_at DESC, post_id)
WHERE user_id IS NOT NULL AND post_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_comments_user_created
ON post_comments(user_id, created_at DESC, post_id)
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discover_posts_project_published
ON discover_posts(project_id, created_at DESC, id DESC)
WHERE project_id IS NOT NULL AND status = 'published' AND deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_status_type
ON projects(user_id, status, project_type, updated_at DESC);
