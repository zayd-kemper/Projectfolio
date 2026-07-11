-- Application Helper: structured profile experience data + prepared application sessions.

CREATE TABLE IF NOT EXISTS profile_experiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('employment', 'education', 'certification')),
  title VARCHAR(200) NOT NULL,
  organization VARCHAR(200) NOT NULL,
  location VARCHAR(120),
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  highlights TEXT[] NOT NULL DEFAULT '{}',
  skills TEXT[] NOT NULL DEFAULT '{}',
  url VARCHAR(500),
  credential_id VARCHAR(120),
  field_of_study VARCHAR(160),
  grade VARCHAR(60),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_experiences_user
  ON profile_experiences(user_id, kind, sort_order, start_date DESC);

CREATE TABLE IF NOT EXISTS application_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(40) NOT NULL DEFAULT 'generic',
  job_title VARCHAR(200),
  company VARCHAR(200),
  job_posting_url VARCHAR(1000),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'generating',
  package JSONB,
  resume_url VARCHAR(1000),
  job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_sessions_user
  ON application_sessions(user_id, created_at DESC);
