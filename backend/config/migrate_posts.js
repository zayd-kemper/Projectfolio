// backend/config/migrate_posts.js
// Run with: node config/migrate_posts.js
// Adds discover_posts, post_comments, post_likes tables

const { pool } = require('./database');

const migrate = async () => {
  console.log('🚀 Running posts migration...');
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // ── DISCOVER POSTS ────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discover_posts (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        title      VARCHAR(300) NOT NULL,
        body       TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ discover_posts table created');

    // ── POST COMMENTS ─────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        post_id    UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body       TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ post_comments table created');

    // ── POST LIKES ────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(post_id, user_id)
      );
    `);
    console.log('  ✅ post_likes table created');

    // ── INDEXES ───────────────────────────────────────────────────────────────
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_user ON discover_posts(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_project ON discover_posts(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_posts_created ON discover_posts(created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id)');
    console.log('  ✅ Indexes created');

    console.log('\n🎉 Posts migration completed!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
};

migrate();