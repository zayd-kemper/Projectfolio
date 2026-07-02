const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { isPrivateAddress } = require('../utils/safeFetch');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('private and link-local addresses are rejected', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.1.1', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateAddress('::ffff:10.1.2.3'), true);
  assert.equal(isPrivateAddress('ff02::1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false);
});

test('startup and auth stay independent of schema and user lookups', () => {
  assert.doesNotMatch(read('server.js'), /ensurePortfolioCustomizerSchema|ensureAgentSchema/);
  assert.doesNotMatch(read('middleware/auth.js'), /config\/database/);
});

test('large uploads never enter multer memory storage', () => {
  assert.doesNotMatch(read('config/cloudinary.js') + read('routes/media.js'), /memoryStorage|\.single\(/);
  assert.match(read('routes/media.js'), /cloudinary\.api\.resource/);
  assert.match(read('routes/media.js'), /providerBytes/);
});

test('expensive authenticated actions have per-user quotas', () => {
  assert.match(read('middleware/userQuotas.js'), /const userQuota/);
  assert.match(read('middleware/userQuotas.js'), /const userCostBudget/);
  assert.match(read('middleware/userQuotas.js'), /const userConcurrency/);
  for (const [file, quota] of [
    ['routes/agent.js', 'agent.chat'],
    ['routes/agent.js', "userCostBudget\\('agent.chat"],
    ['routes/export.js', 'export.pdf'],
    ['routes/export.js', "userCostBudget\\('export.pdf"],
    ['routes/integrations.js', 'integrations.outreach'],
    ['routes/integrations.js', 'integrations.ai-match'],
    ['routes/integrations.js', "userCostBudget\\('integrations.ai-match"],
    ['routes/media.js', 'media.signature'],
    ['routes/media.js', "userCostBudget\\('media.upload"],
    ['routes/jobs.js', 'jobs.events'],
  ]) {
    assert.match(read(file), new RegExp(quota.replace('.', '\\.')), `${file} should apply ${quota}`);
  }
});

test('priority routes use strict schema validation middleware', () => {
  assert.match(read('middleware/schemaValidation.js'), /Unexpected field/);
  assert.match(read('middleware/schemaValidation.js'), /VALIDATION_FAILED/);
  for (const file of [
    'routes/auth.js',
    'routes/projects.js',
    'routes/settings.js',
    'routes/teams.js',
    'routes/discover.js',
    'routes/endorsements.js',
    'routes/integrations.js',
  ]) {
    assert.match(read(file), /validateSchema/, `${file} should apply schema validation`);
  }
});

test('oauth providers use session-backed state and verified email checks', () => {
  const passportConfig = read('config/passport.js');
  assert.match(passportConfig, /state:\s*true/);
  assert.match(passportConfig, /email_verified/);
  assert.match(passportConfig, /Google email is not verified/);
  assert.match(passportConfig, /LinkedIn email is not verified/);
});

test('embeddable HTML escapes profile fields', () => {
  const integrations = read('routes/integrations.js');
  assert.match(integrations, /const escapeHtml/);
  assert.match(integrations, /safeCssColor/);
  assert.match(integrations, /\$\{escapeHtml\(u\.full_name\)\}/);
  assert.match(integrations, /rel="noopener noreferrer"/);
});

test('migration includes the expected online indexes', () => {
  const indexCount = (read('migrations/002_scalability_indexes.sql').match(/CREATE (UNIQUE )?INDEX CONCURRENTLY/g) || []).length;
  assert.ok(indexCount >= 30, `expected at least 30 indexes, got ${indexCount}`);
});
