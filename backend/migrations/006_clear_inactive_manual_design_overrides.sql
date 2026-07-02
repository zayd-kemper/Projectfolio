UPDATE portfolio_settings
   SET manual_design_overrides = '{}'::jsonb
 WHERE COALESCE((agent_design_meta->>'active')::boolean, false) = false
   AND manual_design_overrides IS NOT NULL
   AND manual_design_overrides <> '{}'::jsonb;
