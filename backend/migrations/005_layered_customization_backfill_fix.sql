UPDATE portfolio_settings
   SET agent_custom_css = custom_css,
       agent_design_meta = COALESCE(agent_design_meta, '{}'::jsonb) || '{"active":true,"version":1,"migratedFromCustomCss":true}'::jsonb
 WHERE custom_css IS NOT NULL
   AND agent_custom_css IS NULL
   AND custom_css LIKE '%pf-ai:block:%';
