const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const checks = [
  ['startup performs no schema mutation', () => !/ensurePortfolioCustomizerSchema|ensureAgentSchema/.test(read('server.js'))],
  ['database pool is bounded', () => /DB_POOL_MAX_WEB/.test(read('config/database.js'))],
  ['web statements have a timeout', () => /DB_STATEMENT_TIMEOUT_WEB_MS/.test(read('config/database.js'))],
  ['authentication does not query PostgreSQL per request', () => !/config\/database/.test(read('middleware/auth.js'))],
  ['session lifecycle is delegated to supabase auth', () => !exists('utils/tokens.js') && !exists('utils/authTokenVersion.js')],
  ['auth profile lookups can use Redis', () => /getRedis/.test(read('utils/authProfile.js'))],
  ['rate limits can use Redis', () => /RateLimitRedisStore/.test(read('server.js'))],
  ['public portfolio reads do not write views', () => !/INSERT INTO portfolio_views|UPDATE projects SET view_count/.test(read('routes/portfolio.js'))],
  ['analytics uses durable jobs', () => /analytics:view/.test(read('routes/analytics.js'))],
  ['editor has atomic block sync', () => /blocks\/sync/.test(read('routes/projects.js'))],
  ['discover uses cursor pagination', () => /next_cursor/.test(read('routes/discover.js'))],
  ['discover uses full-text search', () => /websearch_to_tsquery/.test(read('routes/discover.js'))],
  ['uploads bypass web-process buffers', () => !/memoryStorage|\.single\(/.test(read('config/cloudinary.js') + read('routes/media.js'))],
  ['upload completion verifies provider metadata', () => /cloudinary\.api\.resource/.test(read('routes/media.js')) && /providerBytes/.test(read('routes/media.js'))],
  ['AI and PDF work use jobs', () => /agent:chat/.test(read('routes/agent.js')) && /export:pdf/.test(read('routes/export.js'))],
  ['expensive actions have per-user quotas', () => /userQuota/.test(read('middleware/userQuotas.js')) && /agent\.chat/.test(read('routes/agent.js')) && /export\.pdf/.test(read('routes/export.js')) && /integrations\.outreach/.test(read('routes/integrations.js')) && /media\.signature/.test(read('routes/media.js'))],
  ['expensive actions have cost budgets', () => /userCostBudget/.test(read('middleware/userQuotas.js')) && /userCostBudget\('agent\.chat'/.test(read('routes/agent.js')) && /userCostBudget\('export\.pdf'/.test(read('routes/export.js')) && /userCostBudget\('integrations\.ai-match'/.test(read('routes/integrations.js')) && /userCostBudget\('media\.upload'/.test(read('routes/media.js'))],
  ['priority routes use strict schema validation', () => /Unexpected field/.test(read('middleware/schemaValidation.js')) && /VALIDATION_FAILED/.test(read('middleware/schemaValidation.js')) && ['routes/auth.js', 'routes/projects.js', 'routes/settings.js', 'routes/teams.js', 'routes/discover.js', 'routes/endorsements.js', 'routes/integrations.js'].every((file) => /validateSchema/.test(read(file)))],
  ['oauth is delegated to supabase auth', () => !exists('config/passport.js') && !exists('routes/oauth.js') && /verifySupabaseToken/.test(read('middleware/auth.js'))],
  ['embed output escapes profile fields', () => /escapeHtml\(u\.full_name\)/.test(read('routes/integrations.js')) && /safeCssColor/.test(read('routes/integrations.js'))],
  ['outbound fetching rejects private networks', () => /isPrivateAddress/.test(read('utils/safeFetch.js'))],
  ['online indexes are versioned', () => (read('migrations/002_scalability_indexes.sql').match(/CREATE (UNIQUE )?INDEX CONCURRENTLY/g) || []).length >= 30],
];

let failed = 0;
for (const [name, check] of checks) {
  let passed = false;
  try { passed = Boolean(check()); } catch {}
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${name}\n`);
  if (!passed) failed += 1;
}
if (failed) {
  process.stderr.write(`\n${failed} scalability verification check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nAll ${checks.length} scalability checks passed.\n`);
}
