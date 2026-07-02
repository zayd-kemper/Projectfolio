// backend/config/migrate.js
// Run this with: node config/migrate.js
// This creates all your database tables

const { pool } = require('./database');

const createTables = async () => {
  console.log('🚀 Starting database migration...');

  try {
    // Enable UUID extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // ── USERS TABLE ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        full_name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        headline VARCHAR(300),
        bio TEXT,
        avatar_url VARCHAR(500),
        location VARCHAR(200),
        website VARCHAR(300),
        linkedin_url VARCHAR(300),
        github_url VARCHAR(300),
        resume_url VARCHAR(500),
        skills TEXT[] DEFAULT '{}',
        is_email_verified BOOLEAN DEFAULT false,
        google_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ users table created');

    await pool.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS resume_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS identity_mode VARCHAR(50);
    `);
    console.log('  user profile columns ready');

    // ── PROJECTS TABLE ───────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(300) NOT NULL,
        slug VARCHAR(300) NOT NULL,
        tagline VARCHAR(500),
        description TEXT,
        cover_image_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'draft',
        is_featured BOOLEAN DEFAULT false,
        project_type VARCHAR(100),
        technologies TEXT[] DEFAULT '{}',
        collaborators TEXT[] DEFAULT '{}',
        start_date DATE,
        end_date DATE,
        github_url VARCHAR(500),
        live_url VARCHAR(500),
        view_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, slug)
      );
    `);
    console.log('  ✅ projects table created');

    // ── BLOCKS TABLE (the core of the block editor) ──────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        content JSONB NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ blocks table created');

    // ── MEDIA TABLE ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        cloudinary_id VARCHAR(500) NOT NULL,
        url VARCHAR(1000) NOT NULL,
        thumbnail_url VARCHAR(1000),
        filename VARCHAR(300),
        file_type VARCHAR(100),
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        duration FLOAT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ media table created');

    // ── PORTFOLIO SETTINGS TABLE ─────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolio_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        theme VARCHAR(50) DEFAULT 'clean',
        accent_color VARCHAR(7) DEFAULT '#2563eb',
        font_choice VARCHAR(100) DEFAULT 'inter',
        show_contact_form BOOLEAN DEFAULT true,
        show_github_stats BOOLEAN DEFAULT false,
        custom_domain VARCHAR(300),
        seo_title VARCHAR(200),
        seo_description TEXT,
        seo_keywords TEXT[] DEFAULT '{}',
        is_public BOOLEAN DEFAULT true,
        layout VARCHAR(50) DEFAULT 'classic',
        section_order JSONB,
        show_skills BOOLEAN DEFAULT true,
        show_dates BOOLEAN DEFAULT true,
        show_project_type BOOLEAN DEFAULT true,
        section_config JSONB,
        custom_css TEXT,
        custom_js TEXT,
        theme_overrides JSONB DEFAULT '{}',
        animations JSONB DEFAULT '{}',
        site_sections JSONB DEFAULT '[]',
        design_system JSONB DEFAULT '{}',
        interactions JSONB DEFAULT '[]',
        manual_custom_css TEXT,
        agent_custom_css TEXT,
        manual_design_overrides JSONB DEFAULT '{}',
        agent_design_meta JSONB DEFAULT '{"active":false,"version":1}',
        preferred_ai_model VARCHAR(120),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ portfolio_settings table created');

    // ── PORTFOLIO VIEWS TABLE (analytics — personal + team) ──────────────────
    // Keep older databases in sync with the portfolio customizer columns.
    await pool.query(`
      ALTER TABLE portfolio_settings
        ADD COLUMN IF NOT EXISTS section_order JSONB,
        ADD COLUMN IF NOT EXISTS show_skills BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_dates BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_project_type BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS section_config JSONB,
        ADD COLUMN IF NOT EXISTS custom_css TEXT,
        ADD COLUMN IF NOT EXISTS custom_js TEXT,
        ADD COLUMN IF NOT EXISTS theme_overrides JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS animations JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS site_sections JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS design_system JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS interactions JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS manual_custom_css TEXT,
        ADD COLUMN IF NOT EXISTS agent_custom_css TEXT,
        ADD COLUMN IF NOT EXISTS manual_design_overrides JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS agent_design_meta JSONB DEFAULT '{"active":false,"version":1}',
        ADD COLUMN IF NOT EXISTS preferred_ai_model VARCHAR(120);
    `);
    console.log('  customizer columns ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_threads (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) DEFAULT 'Site Agent Chat',
        model_id VARCHAR(120),
        status VARCHAR(40) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        thread_id UUID NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_memories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind VARCHAR(60) DEFAULT 'preference',
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_change_sets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        thread_id UUID REFERENCES ai_threads(id) ON DELETE SET NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(40) DEFAULT 'pending',
        summary TEXT,
        actions JSONB NOT NULL DEFAULT '[]',
        preview JSONB DEFAULT '{}',
        model_id VARCHAR(120),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        applied_at TIMESTAMP WITH TIME ZONE
      );
    `);
    console.log('  ai agent tables ready');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolio_views (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        viewer_ip VARCHAR(50),
        referrer VARCHAR(500),
        user_agent VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ portfolio_views table created');

    // ── ALTER existing portfolio_views to add team_id if missing ─────────────
    // Safe to run on existing databases — adds column only if absent
    await pool.query(`
      ALTER TABLE portfolio_views
        ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
    `).catch(() => {
      // teams table may not exist yet on first run — portfolio_views CREATE above
      // references it, so if we get here the column already exists or teams is missing
    });

    await pool.query(`
      ALTER TABLE teams
        ADD COLUMN IF NOT EXISTS theme VARCHAR(50) DEFAULT 'clean',
        ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) DEFAULT '#2563eb',
        ADD COLUMN IF NOT EXISTS layout VARCHAR(50) DEFAULT 'classic',
        ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS seo_title VARCHAR(200),
        ADD COLUMN IF NOT EXISTS seo_description TEXT,
        ADD COLUMN IF NOT EXISTS show_skills BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_dates BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS show_project_type BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS section_order JSONB,
        ADD COLUMN IF NOT EXISTS section_config JSONB;
    `).catch(() => {
      // Some fresh setup paths create teams outside this migration file.
      // Keep migration idempotent when that table is not present yet.
    });
    console.log('  team portfolio settings columns ready');

    // ── INTEGRATION REQUESTS TABLE ───────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS integration_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        platform_name VARCHAR(200) NOT NULL,
        platform_url VARCHAR(500),
        contact_email VARCHAR(255),
        contact_name VARCHAR(200),
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT,
        sent_at TIMESTAMP WITH TIME ZONE,
        responded_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('  ✅ integration_requests table created');

    // ── INDEXES for performance ──────────────────────────────────────────────
    await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_blocks_project_id ON blocks(project_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_blocks_sort ON blocks(project_id, sort_order)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_views_user_id ON portfolio_views(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_views_team_id ON portfolio_views(team_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_threads_user_id ON ai_threads(user_id, updated_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_id ON ai_messages(thread_id, created_at ASC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_memories_user_id ON ai_memories(user_id, updated_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_change_sets_user_id ON ai_change_sets(user_id, created_at DESC)');
    console.log('  ✅ Indexes created');

    console.log('\n🎉 Database migration completed successfully!');
    console.log('   You can now start the server with: npm run dev\n');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
};

createTables();
