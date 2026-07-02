// backend/config/migrate_discover.js
// Run with: node config/migrate_discover.js
// Adds project_likes and user_follows tables for the Discovery Feed

const { pool } = require('./database');

const migrate = async () => {
  console.log('🚀 Running discovery feed migration...');
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // ── PROJECT LIKES ─────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_likes (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, project_id)
      );
    `);
    console.log('  ✅ project_likes table created');

    // ── USER FOLLOWS ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(follower_id, following_id),
        CHECK(follower_id != following_id)
      );
    `);
    console.log('  ✅ user_follows table created');

    // ── INDEXES ───────────────────────────────────────────────────────────────
    await pool.query('CREATE INDEX IF NOT EXISTS idx_likes_project ON project_likes(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_likes_user ON project_likes(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id)');
    // Index for trending: views in last 7 days
    await pool.query('CREATE INDEX IF NOT EXISTS idx_views_created ON portfolio_views(created_at)');
    console.log('  ✅ Indexes created');

    console.log('\n🎉 Discovery migration completed!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
};

migrate();