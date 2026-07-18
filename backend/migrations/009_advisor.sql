-- Advisor: AI portfolio-growth advisor. Each session stores the questionnaire
-- answers (goals), the generated analysis/suggestions/roadmap package, and the
-- user's roadmap step check-offs (progress). progress lives in its own column so
-- the AI-generated package stays immutable and step check-offs are cheap updates.

CREATE TABLE IF NOT EXISTS advisor_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goals JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'generating',
  package JSONB,
  progress JSONB NOT NULL DEFAULT '{}',
  model_id VARCHAR(120),
  job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_sessions_user
  ON advisor_sessions(user_id, created_at DESC);
