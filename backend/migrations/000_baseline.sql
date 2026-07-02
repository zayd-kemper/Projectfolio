CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255) NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  headline VARCHAR(300), bio TEXT, avatar_url VARCHAR(500), location VARCHAR(200),
  website VARCHAR(300), linkedin_url VARCHAR(300), github_url VARCHAR(300), resume_url VARCHAR(500),
  skills TEXT[] DEFAULT '{}', is_email_verified BOOLEAN DEFAULT false,
  google_id VARCHAR(255), linkedin_id VARCHAR(255), phone VARCHAR(50), contact_email VARCHAR(255),
  identity_mode VARCHAR(50), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL, slug VARCHAR(300) NOT NULL, tagline VARCHAR(500), description TEXT,
  cover_image_url VARCHAR(500), status VARCHAR(50) DEFAULT 'draft', is_featured BOOLEAN DEFAULT false,
  project_type VARCHAR(100), technologies TEXT[] DEFAULT '{}', collaborators TEXT[] DEFAULT '{}',
  start_date DATE, end_date DATE, github_url VARCHAR(500), live_url VARCHAR(500), view_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, content JSONB NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL, cloudinary_id VARCHAR(500) NOT NULL,
  url VARCHAR(1000) NOT NULL, thumbnail_url VARCHAR(1000), filename VARCHAR(300), file_type VARCHAR(100),
  file_size BIGINT, width INTEGER, height INTEGER, duration FLOAT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(50) DEFAULT 'clean', accent_color VARCHAR(7) DEFAULT '#2563eb', font_choice VARCHAR(100) DEFAULT 'inter',
  show_contact_form BOOLEAN DEFAULT true, show_github_stats BOOLEAN DEFAULT false, custom_domain VARCHAR(300),
  seo_title VARCHAR(200), seo_description TEXT, seo_keywords TEXT[] DEFAULT '{}', is_public BOOLEAN DEFAULT true,
  layout VARCHAR(50) DEFAULT 'classic', section_order JSONB, show_skills BOOLEAN DEFAULT true,
  show_dates BOOLEAN DEFAULT true, show_project_type BOOLEAN DEFAULT true, section_config JSONB,
  custom_css TEXT, custom_js TEXT, theme_overrides JSONB DEFAULT '{}', animations JSONB DEFAULT '{}',
  site_sections JSONB DEFAULT '[]', design_system JSONB DEFAULT '{}', interactions JSONB DEFAULT '[]',
  preferred_ai_model VARCHAR(120), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(255) NOT NULL, slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT, avatar_url VARCHAR(500), website VARCHAR(500), type VARCHAR(50) DEFAULT 'organization',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, theme VARCHAR(50) DEFAULT 'clean',
  accent_color VARCHAR(7) DEFAULT '#2563eb', layout VARCHAR(50) DEFAULT 'classic', is_public BOOLEAN DEFAULT true,
  seo_title VARCHAR(200), seo_description TEXT, show_skills BOOLEAN DEFAULT true, show_dates BOOLEAN DEFAULT true,
  show_project_type BOOLEAN DEFAULT true, section_order JSONB DEFAULT '["header","projects"]',
  section_config JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(50) DEFAULT 'member',
  status VARCHAR(50) DEFAULT 'accepted', invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_collaborators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(50) DEFAULT 'editor',
  status VARCHAR(50) DEFAULT 'accepted', invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(team_id, project_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), type VARCHAR(50) NOT NULL, target_id UUID NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, invited_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invite_token VARCHAR(255) UNIQUE, status VARCHAR(50) DEFAULT 'pending', expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL, title VARCHAR(300) NOT NULL, message TEXT, data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endorsements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), token VARCHAR(255) UNIQUE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, from_name VARCHAR(255), from_email VARCHAR(255),
  from_role VARCHAR(255), project_id UUID REFERENCES projects(id) ON DELETE SET NULL, quote TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT false, is_rejected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portfolio_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE, project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  viewer_ip VARCHAR(50), referrer VARCHAR(500), user_agent VARCHAR(500), created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discover_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL, title VARCHAR(300) NOT NULL, body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS post_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), post_id UUID NOT NULL REFERENCES discover_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(post_id, user_id)
);
CREATE TABLE IF NOT EXISTS project_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, project_id)
);
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id), CHECK(follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS ai_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) DEFAULT 'Site Agent Chat', model_id VARCHAR(120), status VARCHAR(40) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), thread_id UUID NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(20) NOT NULL, content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(60) DEFAULT 'preference', content TEXT NOT NULL, metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_change_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), thread_id UUID REFERENCES ai_threads(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(40) DEFAULT 'pending', summary TEXT,
  actions JSONB NOT NULL DEFAULT '[]', preview JSONB DEFAULT '{}', model_id VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT NOW(), applied_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS integration_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform_name VARCHAR(200) NOT NULL, platform_url VARCHAR(500), contact_email VARCHAR(255), contact_name VARCHAR(200),
  status VARCHAR(50) DEFAULT 'pending', notes TEXT, sent_at TIMESTAMPTZ, responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
