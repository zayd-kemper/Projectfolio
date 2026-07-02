const { pool } = require('./database');
const {
  splitManagedCssBlocks,
  combineLayeredCss,
  normalizeAgentDesignMeta,
} = require('../utils/layeredCustomization');

const ensurePortfolioCustomizerSchema = async () => {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS resume_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS identity_mode VARCHAR(50);
  `);

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

  await pool.query(`
    UPDATE portfolio_settings
       SET theme_overrides = COALESCE(theme_overrides, '{}'::jsonb),
           animations = COALESCE(animations, '{}'::jsonb),
           site_sections = COALESCE(site_sections, '[]'::jsonb),
           design_system = COALESCE(design_system, '{}'::jsonb),
           interactions = COALESCE(interactions, '[]'::jsonb),
           manual_design_overrides = COALESCE(manual_design_overrides, '{}'::jsonb),
           agent_design_meta = COALESCE(agent_design_meta, '{"active":false,"version":1}'::jsonb),
           show_skills = COALESCE(show_skills, true),
           show_dates = COALESCE(show_dates, true),
           show_project_type = COALESCE(show_project_type, true)
     WHERE theme_overrides IS NULL
        OR animations IS NULL
        OR site_sections IS NULL
        OR design_system IS NULL
        OR interactions IS NULL
        OR manual_design_overrides IS NULL
        OR agent_design_meta IS NULL
        OR show_skills IS NULL
        OR show_dates IS NULL
        OR show_project_type IS NULL
  `);

  const cssRows = await pool.query(`
    SELECT id, custom_css, manual_custom_css, agent_custom_css, agent_design_meta
      FROM portfolio_settings
     WHERE custom_css IS NOT NULL
       AND (manual_custom_css IS NULL OR agent_custom_css IS NULL)
  `);

  for (const row of cssRows.rows) {
    const split = splitManagedCssBlocks(row.custom_css || '');
    const manualCss = row.manual_custom_css ?? split.manualCss;
    const agentCss = row.agent_custom_css ?? split.agentCss;
    const meta = normalizeAgentDesignMeta(row.agent_design_meta);
    if (agentCss && !meta.active) {
      meta.active = true;
      meta.migratedFromCustomCssAt = new Date().toISOString();
    }
    await pool.query(
      `UPDATE portfolio_settings
          SET manual_custom_css = $1,
              agent_custom_css = $2,
              custom_css = $3,
              agent_design_meta = $4::jsonb
        WHERE id = $5`,
      [
        manualCss || null,
        agentCss || null,
        combineLayeredCss(manualCss, meta.active ? agentCss : ''),
        JSON.stringify(meta),
        row.id,
      ]
    );
  }
};

module.exports = { ensurePortfolioCustomizerSchema };
