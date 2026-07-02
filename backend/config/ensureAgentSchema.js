const { pool } = require('./database');

const ensureAgentSchema = async () => {
  await pool.query(`
    ALTER TABLE portfolio_settings
      ADD COLUMN IF NOT EXISTS site_sections JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS design_system JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS interactions JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS manual_custom_css TEXT,
      ADD COLUMN IF NOT EXISTS agent_custom_css TEXT,
      ADD COLUMN IF NOT EXISTS manual_design_overrides JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS agent_design_meta JSONB DEFAULT '{"active":false,"version":1}',
      ADD COLUMN IF NOT EXISTS preferred_ai_model VARCHAR(120);
  `);

  await pool.query(`
    UPDATE portfolio_settings
       SET site_sections = COALESCE(site_sections, '[]'::jsonb),
           design_system = COALESCE(design_system, '{}'::jsonb),
           interactions = COALESCE(interactions, '[]'::jsonb),
           manual_design_overrides = COALESCE(manual_design_overrides, '{}'::jsonb),
           agent_design_meta = COALESCE(agent_design_meta, '{"active":false,"version":1}'::jsonb)
     WHERE site_sections IS NULL
        OR design_system IS NULL
        OR interactions IS NULL
        OR manual_design_overrides IS NULL
        OR agent_design_meta IS NULL;
  `);

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
    ALTER TABLE ai_threads
      ADD COLUMN IF NOT EXISTS title VARCHAR(200) DEFAULT 'Site Agent Chat',
      ADD COLUMN IF NOT EXISTS model_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
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
    ALTER TABLE ai_messages
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
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
    ALTER TABLE ai_memories
      ADD COLUMN IF NOT EXISTS kind VARCHAR(60) DEFAULT 'preference',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
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

  await pool.query(`
    ALTER TABLE ai_change_sets
      ADD COLUMN IF NOT EXISTS status VARCHAR(40) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS summary TEXT,
      ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS preview JSONB DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS model_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP WITH TIME ZONE;
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_threads_user_id ON ai_threads(user_id, updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_messages_thread_id ON ai_messages(thread_id, created_at ASC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_memories_user_id ON ai_memories(user_id, updated_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_ai_change_sets_user_id ON ai_change_sets(user_id, created_at DESC)');
};

module.exports = { ensureAgentSchema };
