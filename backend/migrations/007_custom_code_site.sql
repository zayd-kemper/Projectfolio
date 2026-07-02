ALTER TABLE portfolio_settings
  ADD COLUMN IF NOT EXISTS custom_site_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_site_html TEXT,
  ADD COLUMN IF NOT EXISTS custom_site_css TEXT,
  ADD COLUMN IF NOT EXISTS custom_site_js TEXT,
  ADD COLUMN IF NOT EXISTS custom_site_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_portfolio_settings_custom_site_enabled
  ON portfolio_settings (user_id)
  WHERE custom_site_enabled = true;
