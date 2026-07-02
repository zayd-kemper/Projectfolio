ALTER TABLE portfolio_settings
  ADD COLUMN IF NOT EXISTS manual_custom_css TEXT,
  ADD COLUMN IF NOT EXISTS agent_custom_css TEXT,
  ADD COLUMN IF NOT EXISTS manual_design_overrides JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agent_design_meta JSONB DEFAULT '{"active":false,"version":1}';

UPDATE portfolio_settings
   SET manual_design_overrides = COALESCE(manual_design_overrides, '{}'::jsonb),
       agent_design_meta = COALESCE(agent_design_meta, '{"active":false,"version":1}'::jsonb)
 WHERE manual_design_overrides IS NULL
    OR agent_design_meta IS NULL;

UPDATE portfolio_settings
   SET manual_custom_css = custom_css
 WHERE custom_css IS NOT NULL
   AND manual_custom_css IS NULL
   AND custom_css NOT LIKE '%pf-ai:block:%';

UPDATE portfolio_settings
   SET manual_custom_css = NULLIF(BTRIM(regexp_replace(
         custom_css,
         $re$/\*[[:space:]]*pf-ai:block:([A-Za-z0-9_-]+)[[:space:]]*\*/(.|\n|\r)*?/\*[[:space:]]*pf-ai:end:\1[[:space:]]*\*/$re$,
         E'\n',
         'g'
       )), ''),
       agent_design_meta = COALESCE(agent_design_meta, '{}'::jsonb) || '{"active":true,"version":1,"migratedFromCustomCss":true}'::jsonb
 WHERE custom_css IS NOT NULL
   AND agent_custom_css IS NULL
   AND custom_css LIKE '%pf-ai:block:%';
